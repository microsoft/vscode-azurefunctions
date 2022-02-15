/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthorizationRule, EventHubManagementClient } from '@azure/arm-eventhub';
import { uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { IBaseResourceWithName, promptForResource } from '../../../../utils/azure';
import { createEventHubClient } from '../../../../utils/azureClients';
import { nonNullProp } from '../../../../utils/nonNull';
import { IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubAuthRuleListStep extends AzureWizardPromptStep<IEventHubWizardContext> {
    public async prompt(context: IEventHubWizardContext): Promise<void> {
        const namespaceName: string = nonNullProp(context, 'namespaceName');
        const resourceGroupName: string = nonNullProp(context, 'resourceGroupName');
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
            context.authRuleName = nonNullProp(result, 'name');
            context.isNamespaceAuthRule = result._description === namespaceDescription;
        }
    }

    public shouldPrompt(context: IEventHubWizardContext): boolean {
        return !!context.namespaceName && !!context.eventhubname && !context.authRuleName;
    }
}
