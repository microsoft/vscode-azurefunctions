/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AuthorizationRule, type EventHubManagementClient } from '@azure/arm-eventhub';
import { getResourceGroupFromId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullValueAndProp } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { promptForResource, type IBaseResourceWithName } from '../../../../utils/azure';
import { createEventHubClient } from '../../../../utils/azureClients';
import { nonNullProp } from '../../../../utils/nonNull';
import { type IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubAuthRuleListStep extends AzureWizardPromptStep<IEventHubWizardContext> {
    public async prompt(context: IEventHubWizardContext): Promise<void> {
        const namespaceName: string = nonNullValueAndProp(context.eventHubsNamespace, 'name');
        const resourceGroupName: string = getResourceGroupFromId(nonNullValueAndProp(context.eventHubsNamespace, 'id'));
        const eventHubName: string = nonNullProp(context, 'eventhubname');

        const client: EventHubManagementClient = await createEventHubClient(context);

        const namespaceDescription: string = localize('namespacePolicy', '(namespace policy)');
        const hubDescription: string = localize('hubPolicy', '(hub policy)');
        // concats hub policies with namespace policies and adds a description to each
        async function getEventHubAuthRules(): Promise<AuthorizationRule[]> {
            const namespaceRules: AuthorizationRule[] = await uiUtils.listAllIterator(client.namespaces.listAuthorizationRules(resourceGroupName, namespaceName));
            namespaceRules.forEach((r: IBaseResourceWithName) => r._description = namespaceDescription);
            const hubRules: AuthorizationRule[] = await uiUtils.listAllIterator(client.eventHubs.listAuthorizationRules(resourceGroupName, namespaceName, eventHubName));
            hubRules.forEach((r: IBaseResourceWithName) => r._description = hubDescription);
            return hubRules.concat(namespaceRules);
        }

        const placeHolder: string = localize('placeHolder', 'Select an event hub policy');
        const result: (AuthorizationRule & IBaseResourceWithName) | undefined = await promptForResource(context, placeHolder, getEventHubAuthRules());
        if (result) {
            context.authRule = result;
            context.isNamespaceAuthRule = result._description === namespaceDescription;
        }
    }

    public shouldPrompt(context: IEventHubWizardContext): boolean {
        return !!context.eventHubsNamespace && !!context.eventhubname && !context.authRule;
    }
}
