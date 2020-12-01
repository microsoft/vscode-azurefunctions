/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, FileSystemWatcher, workspace } from 'vscode';
import { AzExtTreeItem, callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';

export function createRefreshFileWatcher(ti: AzExtTreeItem, globPattern: string): Disposable {
    const refreshMethod: () => Promise<void> = async (): Promise<void> => {
        await callWithTelemetryAndErrorHandling('refreshFileWatcher', async (context: IActionContext) => {
            context.errorHandling.suppressDisplay = true;
            context.telemetry.suppressIfSuccessful = true;
            await ti.refresh(context);
        });
    };

    const watcher: FileSystemWatcher = workspace.createFileSystemWatcher(globPattern);
    return Disposable.from(
        watcher,
        watcher.onDidChange(refreshMethod),
        watcher.onDidCreate(refreshMethod),
        watcher.onDidDelete(refreshMethod)
    );
}
