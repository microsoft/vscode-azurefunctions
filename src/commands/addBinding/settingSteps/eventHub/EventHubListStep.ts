/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventHubManagementClient, EventHubManagementModels } from 'azure-arm-eventhub';
import { AzureWizardPromptStep, createAzureClient } from 'vscode-azureextensionui';
import { localize } from '../../../../localize';
import { promptForResource } from '../../../../utils/azure';
import { nonNullProp } from '../../../../utils/nonNull';
import { IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubListStep extends AzureWizardPromptStep<IEventHubWizardContext> {
    public async prompt(context: IEventHubWizardContext): Promise<void> {
        const namespaceName: string = nonNullProp(context, 'namespaceName');
        const resourceGroupName: string = nonNullProp(context, 'resourceGroupName');

        const placeHolder: string = localize('placeHolder', 'Select an event hub');
        const client: EventHubManagementClient = createAzureClient(context, EventHubManagementClient);
        const result: EventHubManagementModels.EHNamespace | undefined = await promptForResource(placeHolder, client.eventHubs.listByNamespace(resourceGroupName, namespaceName));
        if (result) {
            context.eventhubname = nonNullProp(result, 'name');
        }
    }

    public shouldPrompt(context: IEventHubWizardContext): boolean {
        return !!context.namespaceName && !context.eventhubname;
    }
}
