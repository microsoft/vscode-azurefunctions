/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EHNamespace, EventHubManagementClient } from '@azure/arm-eventhub';
import { uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { promptForResource } from '../../../../utils/azure';
import { createEventHubClient } from '../../../../utils/azureClients';
import { IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubListStep extends AzureWizardPromptStep<IEventHubWizardContext> {
    public async prompt(context: IEventHubWizardContext): Promise<void> {
        const namespaceName: string = nonNullProp(context, 'namespaceName');
        const resourceGroupName: string = nonNullProp(context, 'resourceGroupName');

        const placeHolder: string = localize('placeHolder', 'Select an event hub');
        const client: EventHubManagementClient = await createEventHubClient(context);
        const result: EHNamespace | undefined = await promptForResource(context, placeHolder,
            uiUtils.listAllIterator(client.eventHubs.listByNamespace(resourceGroupName, namespaceName)));
        if (result) {
            context.eventhubname = nonNullProp(result, 'name');
        }
    }

    public shouldPrompt(context: IEventHubWizardContext): boolean {
        return !!context.namespaceName && !context.eventhubname;
    }
}
