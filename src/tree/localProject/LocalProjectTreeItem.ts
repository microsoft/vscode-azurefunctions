/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Disposable, WorkspaceFolder } from 'vscode';
import { AzExtParentTreeItem, AzExtTreeItem } from 'vscode-azureextensionui';
import { functionJsonFileName } from '../../constants';
import { localize } from '../../localize';
import { nodeUtils } from '../../utils/nodeUtils';
import { createRefreshFileWatcher } from './createRefreshFileWatcher';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';
import { IProjectRoot, isLocalTreeItem, LocalParentTreeItem } from './LocalTreeItem';

export class LocalProjectTreeItem extends LocalParentTreeItem implements Disposable {
    public static contextValue: string = 'azFuncLocalProject';
    public contextValue: string = LocalProjectTreeItem.contextValue;
    public readonly label: string = localize('localProject', 'Local Project');
    public readonly projectName: string;

    private _disposables: Disposable[] = [];
    private _localFunctionsTreeItem: LocalFunctionsTreeItem;
    private _root: IProjectRoot;

    public constructor(parent: AzExtParentTreeItem, projectPath: string, workspacePath: string, workspaceFolder: WorkspaceFolder) {
        super(parent);
        this._root = { projectPath, workspacePath, workspaceFolder };

        this.projectName = path.basename(projectPath);

        this._disposables.push(createRefreshFileWatcher(this, path.join(projectPath, '*', functionJsonFileName)));

        this._localFunctionsTreeItem = new LocalFunctionsTreeItem(this);
    }

    public get root(): IProjectRoot {
        return this._root;
    }

    public get iconPath(): nodeUtils.IThemedIconPath {
        return nodeUtils.getThemedIconPath('CreateNewProject');
    }

    public get id(): string {
        return 'localProject' + this.projectName;
    }

    public get description(): string {
        return this.projectName;
    }

    public dispose(): void {
        Disposable.from(...this._disposables).dispose();
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        return [this._localFunctionsTreeItem];
    }

    public isAncestorOfImpl(contextValue: string | RegExp): boolean {
        return isLocalTreeItem(contextValue);
    }

    public pickTreeItemImpl(): AzExtTreeItem {
        return this._localFunctionsTreeItem;
    }
}
