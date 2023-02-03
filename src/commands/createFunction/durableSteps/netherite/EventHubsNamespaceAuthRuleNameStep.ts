/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthorizationRule, EventHubManagementClient } from "@azure/arm-eventhub";
import { getResourceGroupFromId, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardPromptStep, ISubscriptionContext, nonNullValue } from "@microsoft/vscode-azext-utils";
import { getInvalidLengthMessage } from "../../../../constants-nls";
import { localize } from "../../../../localize";
import { createEventHubClient } from "../../../../utils/azureClients";
import { validateUtils } from "../../../../utils/validateUtils";
import { IEventHubsConnectionWizardContext } from "../../../appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext";

export class EventHubsNamespaceAuthRuleNameStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private authRules: AuthorizationRule[];

    public async prompt(context: T): Promise<void> {
        const client: EventHubManagementClient = await createEventHubClient(<T & ISubscriptionContext>context);
        const rgName: string = getResourceGroupFromId(nonNullValue(context.eventHubsNamespace?.id));
        const namespaceName: string = nonNullValue(context.eventHubsNamespace?.name);

        const authRulesIterator = client.namespaces.listAuthorizationRules(rgName, namespaceName);
        this.authRules = await uiUtils.listAllIterator(authRulesIterator);

        context.newAuthRuleName = (await context.ui.showInputBox({
            prompt: localize('authRuleNamePrompt', 'Provide an access policy name for the event hubs namespace.'),
            validateInput: (value: string | undefined) => this.validateInput(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newAuthRuleName && !context.authRule;
    }

    private validateInput(name: string | undefined): string | undefined {
        name = name ? name.trim() : '';

        if (!validateUtils.isValidLength(name, 1, 50)) {
            return getInvalidLengthMessage(1, 50);
        }
        if (!/^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$/.test(name)) {
            return localize('invalidAlphanumericOrHyphenWithSymbols', `A name must consist of alphanumeric characters, '.', '-', or '_'. It must start and end with an alphanumeric character.`);
        }

        const isNameAvailable: boolean = !this.authRules.some(r => r.name === name);
        if (!isNameAvailable) {
            return localize('authRuleExists', 'An access policy with the name "{0}" already exists.', name);
        }

        return undefined;
    }
}
