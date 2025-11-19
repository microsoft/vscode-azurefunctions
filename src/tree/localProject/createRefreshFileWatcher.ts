/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, type AzExtTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { Disposable, workspace, type FileSystemWatcher } from 'vscode';

export function createRefreshFileWatcher(ti: AzExtTreeItem, globPattern: string): Disposable {
    const refreshMethod: () => Promise<void> = async (): Promise<void> => {
        await callWithTelemetryAndErrorHandling('refreshFileWatcher', async (context: IActionContext) => {
            context.errorHandling.suppressDisplay = true;
            context.telemetry.suppressIfSuccessful = true;
            await ti.refresh(context);
        });
    };

    const refreshMethodForDelete: () => Promise<void> = async (): Promise<void> => {
        await callWithTelemetryAndErrorHandling('refreshFileWatcher', async (context: IActionContext) => {
            context.errorHandling.suppressDisplay = true;
            context.telemetry.suppressIfSuccessful = true;
            // need to refresh the parent on delete, as the deleted file's tree item no longer exists
            await ti.parent?.refresh(context);
        });
    };

    const watcher: FileSystemWatcher = workspace.createFileSystemWatcher(globPattern);
    return Disposable.from(
        watcher,
        watcher.onDidChange(refreshMethod),
        watcher.onDidCreate(refreshMethod),
        watcher.onDidDelete(refreshMethodForDelete)
    );
}
