/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AuthorizationRule, type EventHubManagementClient } from "@azure/arm-eventhub";
import { getResourceGroupFromId, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardPromptStep, nonNullProp, validationUtils } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../../../localize";
import { createEventHubClient } from "../../../../../utils/azureClients";
import { type INetheriteAzureConnectionWizardContext } from "../INetheriteConnectionWizardContext";

export class EventHubsNamespaceAuthRuleNameStep<T extends INetheriteAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private authRules: AuthorizationRule[] = [];

    public async prompt(context: T): Promise<void> {
        if (context.eventHubsNamespace) {
            const client: EventHubManagementClient = await createEventHubClient(context);
            const rgName: string = getResourceGroupFromId(nonNullProp(context.eventHubsNamespace, 'id'));
            const namespaceName: string = nonNullProp(context.eventHubsNamespace, 'name');

            const authRulesIterator = client.namespaces.listAuthorizationRules(rgName, namespaceName);
            this.authRules = await uiUtils.listAllIterator(authRulesIterator);
        }

        context.newAuthRuleName = (await context.ui.showInputBox({
            prompt: localize('authRuleNamePrompt', 'Provide an access policy name for the event hubs namespace.'),
            value: 'RootManageSharedAccessKey',
            validateInput: (name: string) => this.validateInput(name),
        })).trim()
    }

    public shouldPrompt(context: T): boolean {
        return !context.newAuthRuleName && !context.authRule;
    }

    private validateInput(name: string = ''): string | undefined {
        name = name.trim();

        const rc: validationUtils.RangeConstraints = { upperLimitIncl: 50 };
        if (!validationUtils.hasValidCharLength(name, rc)) {
            return validationUtils.getInvalidCharLengthMessage(rc);
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
