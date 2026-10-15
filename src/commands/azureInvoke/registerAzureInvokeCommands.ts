/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerCommand, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type AzureInvokeTreeDataProvider } from '../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { HttpRequestController } from '../../webviews/azureInvoke/extension/HttpRequestController';
import { type HttpInvocation } from '../../webviews/azureInvoke/shared/httpRequest';
import { openCollectionFile, saveCollectionFile } from './collectionFiles';

export function registerAzureInvokeCommands(provider: AzureInvokeTreeDataProvider): void {
    const controllers = new Map<string, HttpRequestController>();
    function closeEditors(): void {
        for (const controller of controllers.values()) {
            controller.panel.dispose();
        }
    }
    ext.context.subscriptions.push(new vscode.Disposable(closeEditors));

    function openEditor(invocation: HttpInvocation, saved: boolean): void {
        const existing = controllers.get(invocation.id);
        if (existing) {
            existing.revealToForeground(vscode.ViewColumn.Active);
            return;
        }
        const controller = new HttpRequestController(ext.context, invocation, saved, snapshot => provider.saveRequest(snapshot));
        controllers.set(invocation.id, controller);
        controller.onDisposed(() => controllers.delete(invocation.id));
    }

    registerCommand('azureFunctions.azureInvoke.add', async (context: IActionContext) => {
        const triggers = [
            { label: localize('azureInvoke.httpTrigger', 'HTTP trigger'), supported: true },
            { label: localize('azureInvoke.timerTrigger', 'Timer trigger'), supported: false },
            { label: localize('azureInvoke.blobTrigger', 'Azure Blob Storage trigger'), supported: false },
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
            void vscode.window.showInformationMessage(localize('azureInvoke.httpOnly', 'Only HTTP trigger invocation is available for now.'));
            return;
        }

        openEditor(provider.createRequest(), false);
    });

    registerCommand('azureFunctions.azureInvoke.open', (context: IActionContext, request?: { id: string }) => {
        context.telemetry.maskEntireErrorMessage = true;
        const invocation = request && provider.getRequest(request.id);
        if (!invocation) {
            throw new Error(localize('azureInvoke.requestNotFound', 'This invocation is no longer in the collection.'));
        }
        openEditor(invocation, true);
    });

    registerCommand('azureFunctions.azureInvoke.saveCollection', async (context: IActionContext, target?: vscode.Uri) => {
        context.telemetry.maskEntireErrorMessage = true;
        await saveCollectionFile(context, provider.getChildren(), target);
    });

    registerCommand('azureFunctions.azureInvoke.openCollection', async (context: IActionContext, source?: vscode.Uri) => {
        context.telemetry.maskEntireErrorMessage = true;
        const invocations = await openCollectionFile(context, source);
        if (provider.getChildren().length || controllers.size) {
            await context.ui.showWarningMessage(
                localize('azureInvoke.replaceCollection', 'Opening a collection replaces the current session collection and closes its request tabs. Unsaved edits and invocations not exported to a collection file will be lost.'),
                { modal: true, stepName: 'confirmOpenInvocationCollection' },
                { title: localize('azureInvoke.openCollectionConfirm', 'Open Collection') },
            );
        }
        closeEditors();
        provider.replaceRequests(invocations);
    });
}
