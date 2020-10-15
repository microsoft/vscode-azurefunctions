/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventHubManagementClient, EventHubManagementModels } from '@azure/arm-eventhub';
import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { localize } from '../../../../localize';
import { getResourceGroupFromId, promptForResource } from '../../../../utils/azure';
import { createEventHubClient } from '../../../../utils/azureClients';
import { nonNullProp } from '../../../../utils/nonNull';
import { IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubNamespaceListStep extends AzureWizardPromptStep<IEventHubWizardContext> {
    public async prompt(context: IEventHubWizardContext): Promise<void> {
        const placeHolder: string = localize('placeHolder', 'Select an event hub namespace');
        const client: EventHubManagementClient = await createEventHubClient(context);
        const result: EventHubManagementModels.EHNamespace | undefined = await promptForResource(placeHolder, client.namespaces.list());
        if (result) {
            context.namespaceName = nonNullProp(result, 'name');
            context.resourceGroupName = getResourceGroupFromId(nonNullProp(result, 'id'));
        }
    }

    public shouldPrompt(context: IEventHubWizardContext): boolean {
        return !context.namespaceName;
    }
}
