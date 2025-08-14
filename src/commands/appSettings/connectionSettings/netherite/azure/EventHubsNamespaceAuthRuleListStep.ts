/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KnownAccessRights, type AuthorizationRule, type EventHubManagementClient } from '@azure/arm-eventhub';
import { parseAzureResourceId, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp, nonNullValueAndProp, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { defaultDescription } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { createEventHubClient } from '../../../../../utils/azureClients';
import { type INetheriteAzureConnectionWizardContext } from '../INetheriteConnectionWizardContext';
import { EventHubsNamespaceAuthRuleCreateStep } from './EventHubsNamespaceAuthRuleCreateStep';
import { EventHubsNamespaceAuthRuleNameStep } from './EventHubsNamespaceAuthRuleNameStep';

export class EventHubsNamespaceAuthRuleListStep<T extends INetheriteAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        if (!context.eventHubsNamespace) {
            return;
        }

        const client: EventHubManagementClient = await createEventHubClient(context);
        const parsedResource = parseAzureResourceId(nonNullValueAndProp(context.eventHubsNamespace, 'id'));

        const authRulesIterable = client.namespaces.listAuthorizationRules(parsedResource.resourceGroup, parsedResource.resourceName);
        const authRules: AuthorizationRule[] = await uiUtils.listAllIterator(authRulesIterable);
        const manageAccessRules: AuthorizationRule[] = authRules.filter(authRule => authRule.rights?.includes(KnownAccessRights.Manage));

        context.authRule = (await context.ui.showQuickPick(await this.getPicks(manageAccessRules), {
            placeHolder: localize('chooseSharedAccessPolicy', 'Choose a shared access policy for "{0}".', context.eventHubsNamespace.name),
        })).data;
        // Set the flag indicating this is a namespace-level auth rule since we are listing from the namespaces
        context.isNamespaceAuthRule = true;
    }

    public shouldPrompt(context: T): boolean {
        return !context.authRule;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        if (context.authRule) {
            return undefined;
        }

        return {
            promptSteps: [new EventHubsNamespaceAuthRuleNameStep()],
            executeSteps: [new EventHubsNamespaceAuthRuleCreateStep()],
        };
    }

    private async getPicks(manageAccessRules: AuthorizationRule[]): Promise<IAzureQuickPickItem<AuthorizationRule | undefined>[]> {
        const picks: IAzureQuickPickItem<AuthorizationRule | undefined>[] = [{
            label: localize('createNewPolicy', '$(plus) Create a new policy'),
            data: undefined
        }];

        const rootKeyName: string = 'RootManageSharedAccessKey';
        for (const rule of manageAccessRules) {
            picks.push({
                label: nonNullProp(rule, 'name'),
                description: rule.name === rootKeyName ? defaultDescription : '',
                data: rule,
            });
        }

        return picks;
    }
}
