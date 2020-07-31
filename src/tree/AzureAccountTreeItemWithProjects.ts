/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Disposable, workspace, WorkspaceFolder } from 'vscode';
import { AzExtTreeItem, AzureAccountTreeItemBase, GenericTreeItem, IActionContext, ISubscriptionContext } from 'vscode-azureextensionui';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { getJavaDebugSubpath } from '../commands/initProjectForVSCode/InitVSCodeStep/JavaInitVSCodeStep';
import { funcVersionSetting, hostFileName, ProjectLanguage, projectLanguageSetting, projectSubpathSetting } from '../constants';
import { ext } from '../extensionVariables';
import { FuncVersion, tryParseFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { dotnetUtils } from '../utils/dotnetUtils';
import { mavenUtils } from '../utils/mavenUtils';
import { treeUtils } from '../utils/treeUtils';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { createRefreshFileWatcher } from './localProject/createRefreshFileWatcher';
import { InitLocalProjectTreeItem } from './localProject/InitLocalProjectTreeItem';
import { InvalidLocalProjectTreeItem } from './localProject/InvalidLocalProjectTreeItem';
import { LocalProjectTreeItem } from './localProject/LocalProjectTreeItem';
import { LocalProjectTreeItemBase } from './localProject/LocalProjectTreeItemBase';
import { isLocalProjectCV, isProjectCV, isRemoteProjectCV } from './projectContextValues';
import { SubscriptionTreeItem } from './SubscriptionTreeItem';

export class AzureAccountTreeItemWithProjects extends AzureAccountTreeItemBase {
    private _projectDisposables: Disposable[] = [];

    public constructor(testAccount?: {}) {
        super(undefined, testAccount);
        this.disposables.push(workspace.onDidChangeWorkspaceFolders(async () => await this.refresh()));
        this.disposables.push(workspace.onDidChangeConfiguration(async e => {
            const settings: string[] = [projectLanguageSetting, funcVersionSetting, projectSubpathSetting];
            if (settings.some(s => e.affectsConfiguration(`${ext.prefix}.${s}`))) {
                await this.refresh();
            }
        }));
    }

    public dispose(): void {
        super.dispose();
        Disposable.from(...this._projectDisposables).dispose();
    }

    public createSubscriptionTreeItem(root: ISubscriptionContext): SubscriptionTreeItem {
        return new SubscriptionTreeItem(this, root);
    }

    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        const children: AzExtTreeItem[] = await super.loadMoreChildrenImpl(clearCache, context);

        let hasLocalProject: boolean = false;
        Disposable.from(...this._projectDisposables).dispose();
        this._projectDisposables = [];

        // tslint:disable-next-line: strict-boolean-expressions
        const folders: readonly WorkspaceFolder[] = workspace.workspaceFolders || [];
        for (const folder of folders) {
            const projectPath: string | undefined = await tryGetFunctionProjectRoot(folder.uri.fsPath, true /* suppressPrompt */);
            if (projectPath) {
                try {
                    hasLocalProject = true;

                    const language: ProjectLanguage | undefined = getWorkspaceSetting(projectLanguageSetting, projectPath);
                    const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, projectPath));
                    if (language === undefined || version === undefined) {
                        children.push(new InitLocalProjectTreeItem(this, projectPath));
                    } else {
                        let preCompiledProjectPath: string | undefined;
                        let effectiveProjectPath: string;
                        const compiledProjectPath: string | undefined = await getCompiledProjectPath(projectPath, language);
                        if (compiledProjectPath) {
                            preCompiledProjectPath = projectPath;
                            effectiveProjectPath = compiledProjectPath;
                        } else {
                            effectiveProjectPath = projectPath;
                        }

                        const treeItem: LocalProjectTreeItem = new LocalProjectTreeItem(this, { effectiveProjectPath, folder, language, version, preCompiledProjectPath });
                        this._projectDisposables.push(treeItem);
                        children.push(treeItem);
                    }
                } catch (error) {
                    children.push(new InvalidLocalProjectTreeItem(this, projectPath, error));
                }
            }

            this._projectDisposables.push(createRefreshFileWatcher(this, path.join(folder.uri.fsPath, hostFileName)));
            this._projectDisposables.push(createRefreshFileWatcher(this, path.join(folder.uri.fsPath, '*', hostFileName)));
        }

        if (!hasLocalProject && children.length > 0 && children[0] instanceof GenericTreeItem) {
            const ti: GenericTreeItem = new GenericTreeItem(this, {
                label: localize('createNewProject', 'Create New Project...'),
                commandId: 'azureFunctions.createNewProject',
                contextValue: 'createNewProject',
                iconPath: treeUtils.getThemedIconPath('CreateNewProject')
            });
            ti.commandArgs = [];
            children.unshift(ti);
        }

        return children;
    }

    public compareChildrenImpl(item1: AzExtTreeItem, item2: AzExtTreeItem): number {
        if (item1 instanceof LocalProjectTreeItemBase && !(item2 instanceof LocalProjectTreeItemBase)) {
            return 1;
        } else if (!(item1 instanceof LocalProjectTreeItemBase) && item2 instanceof LocalProjectTreeItemBase) {
            return -1;
        } else {
            return super.compareChildrenImpl(item1, item2);
        }
    }

    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
        const subscription: string = localize('subscription', 'subscription');

        if (expectedContextValues.some(isProjectCV)) {
            if (expectedContextValues.some(isLocalProjectCV) && expectedContextValues.some(isRemoteProjectCV)) {
                this.childTypeLabel = localize('projectOrSubscription', 'project or subscription');
            } else if (expectedContextValues.some(isLocalProjectCV)) {
                this.childTypeLabel = localize('project', 'project');
            } else {
                this.childTypeLabel = subscription;
            }
        } else {
            this.childTypeLabel = subscription;
        }

        return super.pickTreeItemImpl(expectedContextValues);
    }
}

async function getCompiledProjectPath(projectPath: string, projectLanguage: ProjectLanguage): Promise<string | undefined> {
    if (projectLanguage === ProjectLanguage.CSharp || projectLanguage === ProjectLanguage.FSharp) {
        const projFiles: string[] = await dotnetUtils.getProjFiles(projectLanguage, projectPath);
        if (projFiles.length === 1) {
            const targetFramework: string = await dotnetUtils.getTargetFramework(path.join(projectPath, projFiles[0]));
            return path.join(projectPath, dotnetUtils.getDotnetDebugSubpath(targetFramework));
        } else {
            throw new Error(localize('unableToFindProj', 'Unable to detect project file.'));
        }
    } else if (projectLanguage === ProjectLanguage.Java) {
        const functionAppName: string | undefined = await mavenUtils.getFunctionAppNameInPom(path.join(projectPath, 'pom.xml'));
        if (!functionAppName) {
            throw new Error(localize('unableToGetFunctionAppName', 'Unable to detect property "functionAppName" in pom.xml.'));
        } else {
            return path.join(projectPath, getJavaDebugSubpath(functionAppName));
        }
    } else {
        return undefined;
    }
}
