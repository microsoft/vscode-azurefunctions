/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, FileSystemWatcher, workspace } from 'vscode';
import { AzExtTreeItem } from 'vscode-azureextensionui';

export function createRefreshFileWatcher(ti: AzExtTreeItem, globPattern: string): Disposable {
    const watcher: FileSystemWatcher = workspace.createFileSystemWatcher(globPattern);
    return Disposable.from(
        watcher,
        watcher.onDidChange(async () => await ti.refresh()),
        watcher.onDidCreate(async () => await ti.refresh()),
        watcher.onDidDelete(async () => await ti.refresh())
    );
}
