/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EventHubManagementClient } from '@azure/arm-eventhub';
import { parseAzureResourceId } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, nonNullProp, nonNullValueAndProp } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { ext } from '../../../../../extensionVariables';
import { localize } from '../../../../../localize';
import { createEventHubClient } from '../../../../../utils/azureClients';
import { type INetheriteAzureConnectionWizardContext } from '../INetheriteConnectionWizardContext';

export class EventHubCreateStep<T extends INetheriteAzureConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 210;

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        progress.report({ message: localize('creatingEventHub', 'Creating event hub...') });

        const client: EventHubManagementClient = await createEventHubClient(context);
        const parsedResource = parseAzureResourceId(nonNullValueAndProp(context.eventHubsNamespace, 'id'));

        context.eventHub = await client.eventHubs.createOrUpdate(
            parsedResource.resourceGroup,
            parsedResource.resourceName,
            nonNullProp(context, 'newEventHubName'),
            {}
        );

        context.newEventHubConnectionSettingValue = context.eventHub.name;
        ext.outputChannel.appendLog(localize('createdEventHub', 'Successfully created event hub "{0}".', context.eventHub.name));
    }

    public shouldExecute(context: T): boolean {
        return !context.eventHub;
    }
}
