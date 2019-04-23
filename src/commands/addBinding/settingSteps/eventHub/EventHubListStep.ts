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
    public async prompt(wizardContext: IEventHubWizardContext): Promise<void> {
        const namespaceName: string = nonNullProp(wizardContext, 'namespaceName');
        const resourceGroupName: string = nonNullProp(wizardContext, 'resourceGroupName');

        const placeHolder: string = localize('placeHolder', 'Select an event hub');
        const client: EventHubManagementClient = createAzureClient(wizardContext, EventHubManagementClient);
        const result: EventHubManagementModels.EHNamespace | undefined = await promptForResource(placeHolder, client.eventHubs.listByNamespace(resourceGroupName, namespaceName));
        if (result) {
            wizardContext.eventHubName = nonNullProp(result, 'name');
        }
    }

    public shouldPrompt(wizardContext: IEventHubWizardContext): boolean {
        return !!wizardContext.namespaceName && !wizardContext.eventHubName;
    }
}
