/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as retry from 'p-retry';
import { MessageItem, window } from 'vscode';
import { AzExtTreeItem, AzureTreeItem, callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { HttpAuthLevel } from '../../funcConfig/function';
import { localize } from '../../localize';
import { RemoteFunctionsTreeItem } from '../../tree/remoteProject/RemoteFunctionsTreeItem';
import { RemoteFunctionTreeItem } from '../../tree/remoteProject/RemoteFunctionTreeItem';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { uploadAppSettings } from '../appSettings/uploadAppSettings';
import { startStreamingLogs } from '../logstream/startStreamingLogs';

export async function notifyDeployComplete(context: IActionContext, node: SlotTreeItemBase, workspacePath: string): Promise<void> {
    const deployComplete: string = localize('deployComplete', 'Deployment to "{0}" completed.', node.root.client.fullName);
    const viewOutput: MessageItem = { title: localize('viewOutput', 'View output') };
    const streamLogs: MessageItem = { title: localize('streamLogs', 'Stream logs') };
    const uploadSettings: MessageItem = { title: localize('uploadAppSettings', 'Upload settings') };

    // Don't wait
    window.showInformationMessage(deployComplete, streamLogs, uploadSettings, viewOutput).then(async result => {
        await callWithTelemetryAndErrorHandling('postDeploy', async (postDeployContext: IActionContext) => {
            postDeployContext.telemetry.properties.dialogResult = result && result.title;
            if (result === viewOutput) {
                ext.outputChannel.show();
            } else if (result === streamLogs) {
                await startStreamingLogs(postDeployContext, node);
            } else if (result === uploadSettings) {
                await uploadAppSettings(postDeployContext, node.appSettingsTreeItem, workspacePath);
            }
        });
    });

    try {
        const retries: number = 4;
        await retry(
            async (currentAttempt: number) => {
                context.telemetry.properties.queryTriggersAttempt = currentAttempt.toString();
                const message: string = currentAttempt === 1 ?
                    localize('queryingTriggers', 'Querying triggers...') :
                    localize('queryingTriggersAttempt', 'Querying triggers (Attempt {0}/{1})...', currentAttempt, retries + 1);
                ext.outputChannel.appendLog(message, { resourceName: node.client.fullName });
                await listHttpTriggerUrls(context, node);
            },
            { retries, minTimeout: 2 * 1000 }
        );
    } catch (error) {
        // suppress error notification and instead display a warning in the output. We don't want it to seem like the deployment failed.
        context.errorHandling.suppressDisplay = true;
        ext.outputChannel.appendLog(localize('failedToList', 'WARNING: Deployment succeeded, but failed to list http trigger urls.'));
        throw error;
    }
}

async function listHttpTriggerUrls(context: IActionContext, node: SlotTreeItemBase): Promise<void> {
    const children: AzExtTreeItem[] = await node.getCachedChildren(context);
    const functionsNode: RemoteFunctionsTreeItem = <RemoteFunctionsTreeItem>children.find((n: AzureTreeItem) => n instanceof RemoteFunctionsTreeItem);
    await node.treeDataProvider.refresh(context, functionsNode);

    const logOptions: {} = { resourceName: node.client.fullName };
    let hasHttpTriggers: boolean = false;
    const functions: AzExtTreeItem[] = await functionsNode.getCachedChildren(context);
    const anonFunctions: RemoteFunctionTreeItem[] = <RemoteFunctionTreeItem[]>functions.filter((f: AzureTreeItem) => f instanceof RemoteFunctionTreeItem && f.config.isHttpTrigger && f.config.authLevel === HttpAuthLevel.anonymous);
    if (anonFunctions.length > 0) {
        hasHttpTriggers = true;
        ext.outputChannel.appendLog(localize('anonymousFunctionUrls', 'HTTP Trigger Urls:'), logOptions);
        for (const func of anonFunctions) {
            ext.outputChannel.appendLine(`  ${func.label}: ${func.triggerUrl}`);
        }
    }

    if (functions.find((f: AzureTreeItem) => f instanceof RemoteFunctionTreeItem && f.config.isHttpTrigger && f.config.authLevel !== HttpAuthLevel.anonymous)) {
        hasHttpTriggers = true;
        ext.outputChannel.appendLog(localize('nonAnonymousWarning', 'WARNING: Some http trigger urls cannot be displayed in the output window because they require an authentication token. Instead, you may copy them from the Azure Functions explorer.'), logOptions);
    }

    if (!hasHttpTriggers) {
        ext.outputChannel.appendLog(localize('noHttpTriggers', 'No HTTP triggers found.'), logOptions);
    }
}
