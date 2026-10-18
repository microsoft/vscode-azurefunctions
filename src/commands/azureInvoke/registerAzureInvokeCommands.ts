/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerCommand, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { type AzureInvokeTreeDataProvider } from '../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { type HttpRequestEditors } from '../../webviews/azureInvoke/extension/HttpRequestEditors';
import { type CollectionReviews } from '../../webviews/azureInvoke/extension/CollectionReviews';
import { type BlobInvocationEditors } from '../../webviews/azureInvoke/extension/BlobInvocationEditors';
import { openCollectionFile, saveCollectionFile } from './collectionFiles';

export function registerAzureInvokeCommands(provider: AzureInvokeTreeDataProvider, editors: HttpRequestEditors, reviews: CollectionReviews, blobs: BlobInvocationEditors): void {
    registerCommand('azureFunctions.azureInvoke.buildWithAI', async (context: IActionContext) => {
        context.telemetry.maskEntireErrorMessage = true;
        context.errorHandling.suppressDisplay = true;
        await reviews.start();
    });

    registerCommand('azureFunctions.azureInvoke.add', async (context: IActionContext) => {
        const triggers = [
            { label: localize('azureInvoke.httpTrigger', 'HTTP trigger'), supported: true, triggerType: 'http' },
            { label: localize('azureInvoke.timerTrigger', 'Timer trigger'), supported: false },
            { label: localize('azureInvoke.blobTrigger', 'Azure Blob Storage trigger'), supported: true, triggerType: 'blob' },
            { label: localize('azureInvoke.queueTrigger', 'Azure Queue Storage trigger'), supported: false },
            { label: localize('azureInvoke.serviceBusQueueTrigger', 'Azure Service Bus Queue trigger'), supported: false },
            { label: localize('azureInvoke.serviceBusTopicTrigger', 'Azure Service Bus Topic trigger'), supported: false },
            { label: localize('azureInvoke.eventHubTrigger', 'Azure Event Hubs trigger'), supported: false },
            { label: localize('azureInvoke.eventGridTrigger', 'Azure Event Grid trigger'), supported: false },
            { label: localize('azureInvoke.cosmosDBTrigger', 'Azure Cosmos DB trigger'), supported: false },
        ];
        const trigger = await context.ui.showQuickPick(triggers.map(item => ({
            ...item,
            description: item.supported ? undefined : localize('azureInvoke.notSupported', 'Not yet supported'),
        })), {
            placeHolder: localize('azureInvoke.selectTrigger', 'Select a Functions trigger to invoke'),
        });

        if (!trigger.supported) {
            void vscode.window.showInformationMessage(localize('azureInvoke.supportedTriggers', 'HTTP requests and manual Blob uploads to Azurite are available. Other triggers are not yet supported.'));
            return;
        }

        if (trigger.triggerType === 'blob') {
            blobs.open(provider.createBlobInvocation(), false);
        } else {
            editors.open(provider.createRequest(), false);
        }
    });

    registerCommand('azureFunctions.azureInvoke.open', (context: IActionContext, request?: { id: string }) => {
        context.telemetry.maskEntireErrorMessage = true;
        const blob = request && provider.getBlobInvocation(request.id);
        if (blob) {
            blobs.open(blob, true);
            return;
        }
        const invocation = request && provider.getRequest(request.id);
        if (!invocation) {
            throw new Error(localize('azureInvoke.requestNotFound', 'This invocation is no longer in the collection.'));
        }
        editors.open(invocation, true);
    });

    registerCommand('azureFunctions.azureInvoke.debugBlob', async (context: IActionContext, invocation?: { id: string }) => {
        context.telemetry.maskEntireErrorMessage = true;
        if (!invocation || !provider.getBlobInvocation(invocation.id)) {
            throw new Error(localize('azureInvoke.blobNotSaved', 'Save this Blob invocation first, then try again.'));
        }
        await blobs.debugInvocation(context, invocation.id);
    });

    registerCommand('azureFunctions.azureInvoke.saveCollection', async (context: IActionContext, target?: unknown) => {
        context.telemetry.maskEntireErrorMessage = true;
        await saveCollectionFile(context, provider.getInvocations(), target instanceof vscode.Uri ? target : undefined);
    });

    registerCommand('azureFunctions.azureInvoke.openCollection', async (context: IActionContext, source?: unknown) => {
        context.telemetry.maskEntireErrorMessage = true;
        const invocations = await openCollectionFile(context, source instanceof vscode.Uri ? source : undefined);
        if (provider.getInvocations().length || editors.size || blobs.size) {
            await context.ui.showWarningMessage(
                localize('azureInvoke.replaceCollection', 'Opening a collection replaces the current session collection and closes its request tabs. Unsaved edits and invocations not exported to a collection file will be lost.'),
                { modal: true, stepName: 'confirmOpenInvocationCollection' },
                { title: localize('azureInvoke.openCollectionConfirm', 'Open Collection') },
            );
        }
        editors.closeAll();
        blobs.closeAll();
        provider.replaceRequests(invocations);
    });
}
