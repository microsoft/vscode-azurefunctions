/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IDeployContext } from '@microsoft/vscode-azext-azureappservice';
import { callWithTelemetryAndErrorHandling, type AzExtTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as retry from 'p-retry';
import { window, type MessageItem, type WorkspaceFolder } from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { RemoteFunctionTreeItem } from '../../tree/remoteProject/RemoteFunctionTreeItem';
import { RemoteFunctionsTreeItem } from '../../tree/remoteProject/RemoteFunctionsTreeItem';
import { nonNullValue } from '../../utils/nonNull';
import { uploadAppSettings } from '../appSettings/uploadAppSettings';
import { startStreamingLogs } from '../logstream/startStreamingLogs';
import { hasRemoteEventGridBlobTrigger, promptForEventGrid } from './promptForEventGrid';

export async function notifyDeployComplete(context: IDeployContext, node: SlotTreeItem, workspaceFolder: WorkspaceFolder, isFlexConsumption?: boolean, deployedWithFuncCli?: boolean): Promise<void> {
    await node.initSite(context);
    const deployComplete: string = localize('deployComplete', 'Deployment to "{0}" completed.', node.site.fullName);
    const viewOutput: MessageItem = { title: localize('viewOutput', 'View output') };
    const streamLogs: MessageItem = { title: localize('streamLogs', 'Stream logs') };
    const uploadSettings: MessageItem = { title: localize('uploadAppSettings', 'Upload settings') };

    try {
        const shouldCheckEventSystemTopics = isFlexConsumption && await hasRemoteEventGridBlobTrigger(context, node);
        if (shouldCheckEventSystemTopics) {
            await promptForEventGrid(context, workspaceFolder);
        }
    } catch (err) {
        // ignore this error, don't block deploy for this check
    }

    // Don't wait
    void window.showInformationMessage(deployComplete, streamLogs, uploadSettings, viewOutput).then(async result => {
        await callWithTelemetryAndErrorHandling('postDeploy', async (postDeployContext: IActionContext) => {
            postDeployContext.telemetry.properties.dialogResult = result && result.title;
            postDeployContext.valuesToMask.push(...context.valuesToMask);
            context.telemetry.eventVersion = 2;
            await node.initSite(context);

            if (result === viewOutput) {
                ext.outputChannel.show();
            } else if (result === streamLogs) {
                await startStreamingLogs(postDeployContext, node);
            } else if (result === uploadSettings) {
                const subContext = {
                    ...postDeployContext,
                    ...node.site.subscription
                }
                await uploadAppSettings(subContext, node.appSettingsTreeItem, undefined, workspaceFolder);
            }
        });
    });

    try {
        if (deployedWithFuncCli) {
            // don't query triggers if we used the func cli to deploy
            return;
        }
        const retries: number = 4;
        await retry(
            async (currentAttempt: number) => {
                context.telemetry.properties.queryTriggersAttempt = currentAttempt.toString();
                const message: string = currentAttempt === 1 ?
                    localize('queryingTriggers', 'Querying triggers...') :
                    localize('queryingTriggersAttempt', 'Querying triggers (Attempt {0}/{1})...', currentAttempt, retries + 1);
                ext.outputChannel.appendLog(message, { resourceName: node.site.fullName });
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

async function listHttpTriggerUrls(context: IActionContext, node: SlotTreeItem): Promise<void> {
    const children: AzExtTreeItem[] = await node.getCachedChildren(context);
    const functionsNode: RemoteFunctionsTreeItem = <RemoteFunctionsTreeItem>children.find(n => n instanceof RemoteFunctionsTreeItem);
    await node.treeDataProvider.refresh(context, functionsNode);
    await node.initSite(context);
    const logOptions: {} = { resourceName: node.site.fullName };
    let hasHttpTriggers: boolean = false;
    const functions: AzExtTreeItem[] = await functionsNode.getCachedChildren(context);
    const anonFunctions: RemoteFunctionTreeItem[] = <RemoteFunctionTreeItem[]>functions.filter(f => f instanceof RemoteFunctionTreeItem && f.isHttpTrigger && f.isAnonymous);
    if (anonFunctions.length > 0) {
        hasHttpTriggers = true;
        ext.outputChannel.appendLog(localize('anonymousFunctionUrls', 'HTTP Trigger Urls:'), logOptions);
        for (const func of anonFunctions) {
            const triggerRequest = nonNullValue(await func.getTriggerRequest(context), 'triggerRequest')
            ext.outputChannel.appendLine(`  ${func.label}: ${triggerRequest.url}`);
        }
    }

    if (functions.find(f => f instanceof RemoteFunctionTreeItem && f.isHttpTrigger && !f.isAnonymous)) {
        hasHttpTriggers = true;
        ext.outputChannel.appendLog(localize('nonAnonymousWarning', 'WARNING: Some http trigger urls cannot be displayed in the output window because they require an authentication token. Instead, you may copy them from the Azure Resources explorer.'), logOptions);
    }

    if (!hasHttpTriggers) {
        ext.outputChannel.appendLog(localize('noHttpTriggers', 'No HTTP triggers found.'), logOptions);
    }
}
