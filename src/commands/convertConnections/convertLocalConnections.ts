/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type AppSettingTreeItem } from "@microsoft/vscode-azext-azureappsettings";
import { RoleAssignmentExecuteStep, UserAssignedIdentityListStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext, type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { createActivityContext } from "../../utils/activityUtils";
import { ConvertSettingsStep } from "./ConvertSettingsStep";
import { type IConvertConnectionsContext } from "./IConvertConnectionsContext";
import { SelectConnectionsStep, type Connection } from "./SelectConnectionsStep";

export async function convertLocalConnections(context: IActionContext, node?: AppSettingTreeItem): Promise<void> {
    const connections: Connection[] = []
    if (node) {
        connections.push({ name: node.id, value: node.value })
        await node.runWithTemporaryDescription(context, localize('converting', 'Converting...'), async () => {
            await convertLocalConnectionsInternal(context, connections);
        });
    } else {
        await convertLocalConnectionsInternal(context);
    }
}

export async function convertLocalConnectionsInternal(context: IActionContext, connections?: Connection[]): Promise<void> {
    const wizardContext: IActionContext & Partial<IConvertConnectionsContext> = {
        ...context,
        local: true,
        ...await createActivityContext()
    };

    wizardContext.connections = connections;

    wizardContext.activityChildren = [];

    const title: string = localize('convertLocalConnections', 'Convert Local Project Connections to Identity-Based Connections');

    const promptSteps: AzureWizardPromptStep<IConvertConnectionsContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IConvertConnectionsContext>[] = [];

    const subscriptionPromptStep: AzureWizardPromptStep<ISubscriptionActionContext> | undefined = await ext.azureAccountTreeItem.getSubscriptionPromptStep(context);
    if (subscriptionPromptStep) {
        promptSteps.push(subscriptionPromptStep);
    }

    promptSteps.push(new SelectConnectionsStep(), new UserAssignedIdentityListStep())
    executeSteps.push(new ConvertSettingsStep(), new RoleAssignmentExecuteStep(() => wizardContext.roles));

    const wizard: AzureWizard<IConvertConnectionsContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps
    });

    await wizard.prompt();
    await wizard.execute();
}
