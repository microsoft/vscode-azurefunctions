/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureAccountTreeItemBase } from '@microsoft/vscode-azext-azureutils';
import { GenericTreeItem, callWithTelemetryAndErrorHandling, type AzExtTreeItem, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { Disposable, workspace } from 'vscode';
import { funcVersionSetting, hostFileName, projectLanguageSetting, projectSubpathSetting } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { listLocalProjects, type LocalProjectInternal } from '../workspace/listLocalProjects';
import { SubscriptionTreeItem } from './SubscriptionTreeItem';
import { InitLocalProjectTreeItem } from './localProject/InitLocalProjectTreeItem';
import { InvalidLocalProjectTreeItem } from './localProject/InvalidLocalProjectTreeItem';
import { LocalProjectTreeItem } from './localProject/LocalProjectTreeItem';
import { LocalProjectTreeItemBase } from './localProject/LocalProjectTreeItemBase';
import { createRefreshFileWatcher } from './localProject/createRefreshFileWatcher';
import { isLocalProjectCV, isProjectCV, isRemoteProjectCV } from './projectContextValues';

// TODO: Remove this file. Only the long running tests rely on it (which we need to redo)
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

        const workspaceProjects = await listLocalProjects();

        for (const project of workspaceProjects.initializedProjects) {
            hasLocalProject = true;
            const treeItem: LocalProjectTreeItem = new LocalProjectTreeItem(this, project as LocalProjectInternal);
            this._projectDisposables.push(treeItem);
            children.push(treeItem);
            this._projectDisposables.push(createRefreshFileWatcher(this, path.join(project.options.folder.uri.fsPath, hostFileName)));
            this._projectDisposables.push(createRefreshFileWatcher(this, path.join(project.options.folder.uri.fsPath, '*', hostFileName)));
        }

        for (const unintializedProject of workspaceProjects.unintializedProjects) {
            hasLocalProject = true;
            children.push(new InitLocalProjectTreeItem(this, unintializedProject.projectPath, unintializedProject.workspaceFolder));
        }

        for (const invalidProject of workspaceProjects.invalidProjects) {
            hasLocalProject = true;
            children.push(new InvalidLocalProjectTreeItem(this, invalidProject.projectPath, invalidProject.error, invalidProject.workspaceFolder));
        }

        if (!hasLocalProject && children.length > 0 && children[0] instanceof GenericTreeItem) {
            const ti: GenericTreeItem = new GenericTreeItem(this, {
                label: localize('createNewProject', 'Create New Project...'),
                commandId: 'azureFunctions.createFunction',
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
