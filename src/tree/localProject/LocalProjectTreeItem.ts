/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Disposable, FileSystemWatcher, Uri, workspace, WorkspaceFolder } from 'vscode';
import { AzureTreeItem, RootTreeItem } from 'vscode-azureextensionui';
import { functionJsonFileName } from '../../constants';
import { localize } from '../../localize';
import { nodeUtils } from '../../utils/nodeUtils';
import { IProjectRoot } from './IProjectRoot';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';

export class LocalProjectTreeItem extends RootTreeItem<IProjectRoot> implements Disposable {
    public static contextValue: string = 'azFuncLocalProject';
    public contextValue: string = LocalProjectTreeItem.contextValue;
    public readonly label: string = localize('localProject', 'Local Project');
    public readonly projectName: string;

    private _disposables: Disposable[] = [];
    private _localFunctionsTreeItem: LocalFunctionsTreeItem;

    public constructor(projectPath: string, workspacePath: string, workspaceFolder: WorkspaceFolder) {
        super(<IProjectRoot>{ projectPath, workspacePath, workspaceFolder });

        this.projectName = path.basename(projectPath);

        const watcher: FileSystemWatcher = workspace.createFileSystemWatcher(path.join(projectPath, '*', functionJsonFileName));
        this._disposables.push(watcher);
        this._disposables.push(watcher.onDidChange(async e => await this.functionsChanged(e)));
        this._disposables.push(watcher.onDidCreate(async e => await this.functionsChanged(e)));
        this._disposables.push(watcher.onDidDelete(async e => await this.functionsChanged(e)));

        this._localFunctionsTreeItem = new LocalFunctionsTreeItem(this);
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
        this._disposables.forEach(d => { d.dispose(); });
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzureTreeItem<IProjectRoot>[]> {
        return [this._localFunctionsTreeItem];
    }

    public isAncestorOfImpl(contextValue: string | RegExp): boolean {
        return typeof contextValue === 'string' && /^azFuncLocal/.test(contextValue);
    }

    public pickTreeItemImpl(): AzureTreeItem<IProjectRoot> {
        return this._localFunctionsTreeItem;
    }

    private async functionsChanged(_uri: Uri): Promise<void> {
        await this.refresh();
    }
}
