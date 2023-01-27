/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, ISubscriptionContext, nonNullValue } from "@microsoft/vscode-azext-utils";
import { IEventHubsConnectionWizardContext } from "../../../appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext";
import { EventHubsNamespaceAuthRuleCreateStep } from "./EventHubsNamespaceAuthRuleCreateStep";
import { EventHubsNamespaceAuthRuleNameStep } from "./EventHubsNamespaceAuthRuleNameStep";

export async function createAndGetAuthRuleName(context: IEventHubsConnectionWizardContext & ISubscriptionContext): Promise<string> {
    const wizard: AzureWizard<IEventHubsConnectionWizardContext & ISubscriptionContext> = new AzureWizard(context, {
        promptSteps: [new EventHubsNamespaceAuthRuleNameStep()],
        executeSteps: [new EventHubsNamespaceAuthRuleCreateStep()]
    });
    await wizard.prompt();
    await wizard.execute();

    return nonNullValue(context.authRule?.name);
}
