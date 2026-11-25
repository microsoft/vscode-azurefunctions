/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';

export async function addInvocation(context: IActionContext): Promise<void> {
    const triggers = [
        { label: localize('azureInvoke.httpTrigger', 'HTTP trigger'), supported: true },
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
        throw new Error(localize('azureInvoke.triggerNotSupported', '"{0}" is not yet supported. Only HTTP triggers can be invoked for now.', trigger.label));
    }

    ext.invocationEditorManager.open(ext.invocationCollection.createDraft(), false);
}
