/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { type AzureInvokeTreeDataProvider } from '../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { type HttpRequestEditors } from '../../webviews/azureInvoke/extension/HttpRequestEditors';

export function addInvocationCommandFactory(provider: AzureInvokeTreeDataProvider, editors: HttpRequestEditors) {
    return async (context: IActionContext): Promise<void> => {
        const triggers = [
            { label: localize('azureInvoke.httpTrigger', 'HTTP trigger'), supported: true, triggerType: 'http' },
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
            void vscode.window.showInformationMessage(localize('azureInvoke.supportedTriggers', 'HTTP requests are available. Other triggers are not yet supported.'));
            return;
        }

        editors.open(provider.createRequest(), false);
    };
}
