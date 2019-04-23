/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventHubManagementClient, EventHubManagementModels } from 'azure-arm-eventhub';
import { AzureWizardPromptStep, createAzureClient } from 'vscode-azureextensionui';
import { localize } from '../../../../localize';
import { IBaseResourceWithName, promptForResource } from '../../../../utils/azure';
import { nonNullProp } from '../../../../utils/nonNull';
import { IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubAuthRuleListStep extends AzureWizardPromptStep<IEventHubWizardContext> {
    public async prompt(wizardContext: IEventHubWizardContext): Promise<void> {
        const namespaceName: string = nonNullProp(wizardContext, 'namespaceName');
        const resourceGroupName: string = nonNullProp(wizardContext, 'resourceGroupName');
        const eventHubName: string = nonNullProp(wizardContext, 'eventHubName');

        const client: EventHubManagementClient = createAzureClient(wizardContext, EventHubManagementClient);

        const namespaceDescription: string = localize('namespacePolicy', '(namespace policy)');
        const hubDescription: string = localize('hubPolicy', '(hub policy)');
        // concats hub policies with namespace policies and adds a description to each
        async function getEventHubAuthRules(): Promise<EventHubManagementModels.AuthorizationRule[]> {
            const namespaceRules: EventHubManagementModels.AuthorizationRule[] = await client.namespaces.listAuthorizationRules(resourceGroupName, namespaceName);
            namespaceRules.forEach((r: IBaseResourceWithName) => r._description = namespaceDescription);
            const hubRules: EventHubManagementModels.AuthorizationRule[] = await client.eventHubs.listAuthorizationRules(resourceGroupName, namespaceName, eventHubName);
            hubRules.forEach((r: IBaseResourceWithName) => r._description = hubDescription);
            return hubRules.concat(namespaceRules);
        }

        const placeHolder: string = localize('placeHolder', 'Select an event hub policy');
        const result: (EventHubManagementModels.AuthorizationRule & IBaseResourceWithName) | undefined = await promptForResource(placeHolder, getEventHubAuthRules());
        if (result) {
            wizardContext.authRuleName = nonNullProp(result, 'name');
            wizardContext.isNamespaceAuthRule = result._description === namespaceDescription;
        }
    }

    public shouldPrompt(wizardContext: IEventHubWizardContext): boolean {
        return !!wizardContext.namespaceName && !!wizardContext.eventHubName && !wizardContext.authRuleName;
    }
}
