/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Disposable, workspace, WorkspaceFolder } from 'vscode';
import { AzExtTreeItem, AzureAccountTreeItemBase, callWithTelemetryAndErrorHandling, GenericTreeItem, IActionContext, ISubscriptionContext } from 'vscode-azureextensionui';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { getFunctionAppName, getJavaDebugSubpath } from '../commands/initProjectForVSCode/InitVSCodeStep/JavaInitVSCodeStep';
import { funcVersionSetting, hostFileName, javaBuildTool, JavaBuildTool, ProjectLanguage, projectLanguageSetting, projectSubpathSetting } from '../constants';
import { ext } from '../extensionVariables';
import { FuncVersion, tryParseFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { dotnetUtils } from '../utils/dotnetUtils';
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
        this.disposables.push(workspace.onDidChangeWorkspaceFolders(async () => {
            await callWithTelemetryAndErrorHandling('AzureAccountTreeItemWithProjects.onDidChangeWorkspaceFolders', async (context: IActionContext) => {
                context.errorHandling.suppressDisplay = true;
                context.telemetry.suppressIfSuccessful = true;
                await this.refresh(context);
            });
        }));
        this.disposables.push(workspace.onDidChangeConfiguration(async e => {
            await callWithTelemetryAndErrorHandling('AzureAccountTreeItemWithProjects.onDidChangeConfiguration', async (context: IActionContext) => {
                context.errorHandling.suppressDisplay = true;
                context.telemetry.suppressIfSuccessful = true;
                const settings: string[] = [projectLanguageSetting, funcVersionSetting, projectSubpathSetting];
                if (settings.some(s => e.affectsConfiguration(`${ext.prefix}.${s}`))) {
                    await this.refresh(context);
                }
            });
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

        const folders: readonly WorkspaceFolder[] = workspace.workspaceFolders || [];
        for (const folder of folders) {
            const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, folder);
            if (projectPath) {
                try {
                    hasLocalProject = true;

                    const language: ProjectLanguage | undefined = getWorkspaceSetting(projectLanguageSetting, projectPath);
                    const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, projectPath));
                    if (language === undefined || version === undefined) {
                        children.push(new InitLocalProjectTreeItem(this, projectPath, folder));
                    } else {
                        let preCompiledProjectPath: string | undefined;
                        let effectiveProjectPath: string;
                        let isIsolated: boolean | undefined;
                        const compiledProjectInfo: CompiledProjectInfo | undefined = await getCompiledProjectInfo(context, projectPath, language);
                        if (compiledProjectInfo) {
                            preCompiledProjectPath = projectPath;
                            effectiveProjectPath = compiledProjectInfo.compiledProjectPath;
                            isIsolated = compiledProjectInfo.isIsolated;
                        } else {
                            effectiveProjectPath = projectPath;
                        }


                        const treeItem: LocalProjectTreeItem = new LocalProjectTreeItem(this, { effectiveProjectPath, folder, language, version, preCompiledProjectPath, isIsolated });
                        this._projectDisposables.push(treeItem);
                        children.push(treeItem);
                    }
                } catch (error) {
                    children.push(new InvalidLocalProjectTreeItem(this, projectPath, error, folder));
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

type CompiledProjectInfo = { compiledProjectPath: string; isIsolated: boolean };

async function getCompiledProjectInfo(context: IActionContext, projectPath: string, projectLanguage: ProjectLanguage): Promise<CompiledProjectInfo | undefined> {
    if (projectLanguage === ProjectLanguage.CSharp || projectLanguage === ProjectLanguage.FSharp) {
        const projFiles: dotnetUtils.ProjectFile[] = await dotnetUtils.getProjFiles(context, projectLanguage, projectPath);
        if (projFiles.length === 1) {
            const targetFramework: string = await dotnetUtils.getTargetFramework(projFiles[0]);
            const isIsolated = await dotnetUtils.getIsIsolated(projFiles[0]);
            return { compiledProjectPath: path.join(projectPath, dotnetUtils.getDotnetDebugSubpath(targetFramework)), isIsolated };
        } else {
            throw new Error(localize('unableToFindProj', 'Unable to detect project file.'));
        }
    } else if (projectLanguage === ProjectLanguage.Java) {
        const buildTool: JavaBuildTool | undefined = getWorkspaceSetting(javaBuildTool, projectPath);
        const functionAppName: string | undefined = await getFunctionAppName(projectPath, buildTool);
        if (!functionAppName) {
            throw new Error(localize('unableToGetFunctionAppName', 'Unable to detect property "functionAppName" in pom.xml.'));
        } else {
            return { compiledProjectPath: path.join(projectPath, getJavaDebugSubpath(functionAppName, buildTool)), isIsolated: false };
        }
    } else {
        return undefined;
    }
}
