/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageItem, window } from 'vscode';
import { AzureTreeItem, callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { HttpAuthLevel } from '../../FunctionConfig';
import { localize } from '../../localize';
import { FunctionsTreeItem } from '../../tree/FunctionsTreeItem';
import { FunctionTreeItem } from '../../tree/FunctionTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { uploadAppSettings } from '../appSettings/uploadAppSettings';
import { startStreamingLogs } from '../logstream/startStreamingLogs';

export async function notifyDeployComplete(actionContext: IActionContext, node: SlotTreeItemBase, workspacePath: string): Promise<void> {
    const deployComplete: string = localize('deployComplete', 'Deployment to "{0}" completed.', node.root.client.fullName);
    ext.outputChannel.appendLine(deployComplete);
    const viewOutput: MessageItem = { title: localize('viewOutput', 'View output') };
    const streamLogs: MessageItem = { title: localize('streamLogs', 'Stream logs') };
    const uploadSettings: MessageItem = { title: localize('uploadAppSettings', 'Upload settings') };

    // Don't wait
    window.showInformationMessage(deployComplete, streamLogs, uploadSettings, viewOutput).then(async result => {
        await callWithTelemetryAndErrorHandling('postDeploy', async function (this: IActionContext): Promise<void> {
            this.properties.dialogResult = result && result.title;
            if (result === viewOutput) {
                ext.outputChannel.show();
            } else if (result === streamLogs) {
                await startStreamingLogs(node);
            } else if (result === uploadSettings) {
                await uploadAppSettings(node.appSettingsTreeItem, workspacePath);
            }
        });
    });

    await listHttpTriggerUrls(actionContext, node);
}

async function listHttpTriggerUrls(actionContext: IActionContext, node: SlotTreeItemBase): Promise<void> {
    try {
        const children: AzureTreeItem[] = await node.getCachedChildren();
        const functionsNode: FunctionsTreeItem = <FunctionsTreeItem>children.find((n: AzureTreeItem) => n instanceof FunctionsTreeItem);
        await node.treeDataProvider.refresh(functionsNode);
        const functions: AzureTreeItem[] = await functionsNode.getCachedChildren();
        const anonFunctions: FunctionTreeItem[] = <FunctionTreeItem[]>functions.filter((f: AzureTreeItem) => f instanceof FunctionTreeItem && f.config.isHttpTrigger && f.config.authLevel === HttpAuthLevel.anonymous);
        if (anonFunctions.length > 0) {
            ext.outputChannel.appendLine(localize('anonymousFunctionUrls', 'HTTP Trigger Urls:'));
            for (const func of anonFunctions) {
                ext.outputChannel.appendLine(`  ${func.label}: ${func.triggerUrl}`);
            }
        }

        if (functions.find((f: AzureTreeItem) => f instanceof FunctionTreeItem && f.config.isHttpTrigger && f.config.authLevel !== HttpAuthLevel.anonymous)) {
            ext.outputChannel.appendLine(localize('nonAnonymousWarning', 'WARNING: Some http trigger urls cannot be displayed in the output window because they require an authentication token. Instead, you may copy them from the Azure Functions explorer.'));
        }
    } catch (error) {
        // suppress error notification and instead display a warning in the output. We don't want it to seem like the deployment failed.
        actionContext.suppressErrorDisplay = true;
        ext.outputChannel.appendLine(localize('failedToList', 'WARNING: Deployment succeeded, but failed to list http trigger urls.'));
        throw error;
    }
}
