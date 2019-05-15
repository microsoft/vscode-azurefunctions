/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Disposable, workspace, WorkspaceFolder } from 'vscode';
import { AzExtTreeItem, AzureAccountTreeItemBase, ISubscriptionRoot, TestAzureAccount } from 'vscode-azureextensionui';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { hostFileName } from '../constants';
import { localize } from '../localize';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { createRefreshFileWatcher } from './localProject/createRefreshFileWatcher';
import { LocalProjectTreeItem } from './localProject/LocalProjectTreeItem';
import { isLocalTreeItem } from './localProject/LocalTreeItem';
import { SubscriptionTreeItem } from './SubscriptionTreeItem';

const enableProjectTreeSetting: string = 'enableProjectTree';

export class AzureAccountTreeItemWithProjects extends AzureAccountTreeItemBase {
    private _projectDisposables: Disposable[] = [];

    public constructor(testAccount?: TestAzureAccount) {
        super(undefined, testAccount);
        if (getWorkspaceSetting(enableProjectTreeSetting)) {
            this.disposables.push(workspace.onDidChangeWorkspaceFolders(async () => await this.refresh()));
        }
    }

    public dispose(): void {
        super.dispose();
        Disposable.from(...this._projectDisposables).dispose();
    }

    public createSubscriptionTreeItem(root: ISubscriptionRoot): SubscriptionTreeItem {
        return new SubscriptionTreeItem(this, root);
    }

    public async loadMoreChildrenImpl(clearCache: boolean): Promise<AzExtTreeItem[]> {
        const children: AzExtTreeItem[] = await super.loadMoreChildrenImpl(clearCache);

        if (getWorkspaceSetting(enableProjectTreeSetting)) {
            Disposable.from(...this._projectDisposables).dispose();
            this._projectDisposables = [];

            // tslint:disable-next-line: strict-boolean-expressions
            const folders: WorkspaceFolder[] = workspace.workspaceFolders || [];
            for (const folder of folders) {
                const projectPath: string | undefined = await tryGetFunctionProjectRoot(folder.uri.fsPath, true /* suppressPrompt */);
                if (projectPath) {
                    const treeItem: LocalProjectTreeItem = new LocalProjectTreeItem(this, projectPath, folder.uri.fsPath, folder);
                    this._projectDisposables.push(treeItem);
                    children.push(treeItem);
                }

                this._projectDisposables.push(createRefreshFileWatcher(this, path.join(folder.uri.fsPath, hostFileName)));
                this._projectDisposables.push(createRefreshFileWatcher(this, path.join(folder.uri.fsPath, '*', hostFileName)));
            }
        }
        return children;
    }

    public compareChildrenImpl(item1: AzExtTreeItem, item2: AzExtTreeItem): number {
        if (item1 instanceof LocalProjectTreeItem && !(item2 instanceof LocalProjectTreeItem)) {
            return 1;
        } else if (!(item1 instanceof LocalProjectTreeItem) && item2 instanceof LocalProjectTreeItem) {
            return -1;
        } else {
            return super.compareChildrenImpl(item1, item2);
        }
    }

    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
        if (expectedContextValues.some(isLocalTreeItem)) {
            this.childTypeLabel = localize('project', 'project');
        } else {
            this.childTypeLabel = localize('subscription', 'subscription');
            return super.pickTreeItemImpl(expectedContextValues);
        }

        return undefined;
    }
}
