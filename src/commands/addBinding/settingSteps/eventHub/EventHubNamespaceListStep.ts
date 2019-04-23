/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventHubManagementClient, EventHubManagementModels } from 'azure-arm-eventhub';
import { AzureWizardPromptStep, createAzureClient } from 'vscode-azureextensionui';
import { localize } from '../../../../localize';
import { getResourceGroupFromId, promptForResource } from '../../../../utils/azure';
import { nonNullProp } from '../../../../utils/nonNull';
import { IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubNamespaceListStep extends AzureWizardPromptStep<IEventHubWizardContext> {
    public async prompt(wizardContext: IEventHubWizardContext): Promise<void> {
        const placeHolder: string = localize('placeHolder', 'Select an event hub namespace');
        const client: EventHubManagementClient = createAzureClient(wizardContext, EventHubManagementClient);
        const result: EventHubManagementModels.EHNamespace | undefined = await promptForResource(placeHolder, client.namespaces.list());
        if (result) {
            wizardContext.namespaceName = nonNullProp(result, 'name');
            wizardContext.resourceGroupName = getResourceGroupFromId(nonNullProp(result, 'id'));
        }
    }

    public shouldPrompt(wizardContext: IEventHubWizardContext): boolean {
        return !wizardContext.namespaceName;
    }
}
