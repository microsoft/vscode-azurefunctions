/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EHNamespace, EventHubManagementClient } from '@azure/arm-eventhub';
import { getResourceGroupFromId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { promptForResource } from '../../../../utils/azure';
import { createEventHubClient } from '../../../../utils/azureClients';
import { IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubNamespaceListStep extends AzureWizardPromptStep<IEventHubWizardContext> {
    public async prompt(context: IEventHubWizardContext): Promise<void> {
        const placeHolder: string = localize('placeHolder', 'Select an event hub namespace');
        const client: EventHubManagementClient = await createEventHubClient(context);
        const result: EHNamespace | undefined = await promptForResource(context, placeHolder,
            uiUtils.listAllIterator(client.namespaces.list()));
        if (result) {
            context.namespaceName = nonNullProp(result, 'name');
            context.resourceGroupName = getResourceGroupFromId(nonNullProp(result, 'id'));
        }
    }

    public shouldPrompt(context: IEventHubWizardContext): boolean {
        return !context.namespaceName;
    }
}
