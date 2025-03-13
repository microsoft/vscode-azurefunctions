/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type AppSettingTreeItem } from "@microsoft/vscode-azext-azureappsettings";
import { RoleAssignmentExecuteStep, UserAssignedIdentityListStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext, type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";
import { type MessageItem } from "vscode";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { createActivityContext } from "../../utils/activityUtils";
import { pickFunctionApp } from "../../utils/pickFunctionApp";
import { ConnectionsListStep, type Connection } from "./ConnectionsListStep";
import { type IAddMIConnectionsContext } from "./IAddMIConnectionsContext";
import { RemoteSettingsAddStep } from "./RemoteSettingsAddStep";
import { SettingsAddBaseStep } from "./SettingsAddBaseStep";

export async function addRemoteMIConnections(context: IActionContext, node?: AppSettingTreeItem): Promise<void> {
    const connections: Connection[] = []
    if (node) {
        connections.push({ name: node.id, value: node.value });
        await node.parent.runWithTemporaryDescription(context, localize('adding', 'Adding...'), async () => {
            await addRemoteMIConnectionsInternal(context, connections, node);
        });
    } else {
        await addRemoteMIConnectionsInternal(context);
    }
}

export async function addRemoteMIConnectionsInternal(context: IActionContext, connections?: Connection[], node?: AppSettingTreeItem): Promise<void> {
    const wizardContext: IActionContext & Partial<IAddMIConnectionsContext> = {
        ...context,
        ...await createActivityContext()
    };

    wizardContext.connections = connections;

    wizardContext.activityChildren = [];

    const title: string = localize('addRemoteConnections', 'Add Function App Identity Connections');

    const promptSteps: AzureWizardPromptStep<IAddMIConnectionsContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IAddMIConnectionsContext>[] = [];

    wizardContext.functionapp = node?.parent.parent as SlotTreeItem ?? await pickFunctionApp(wizardContext)
    if (!wizardContext.subscriptionId) {
        const subscriptionPromptStep: AzureWizardPromptStep<ISubscriptionActionContext> | undefined = await ext.azureAccountTreeItem.getSubscriptionPromptStep(context);
        if (subscriptionPromptStep) {
            promptSteps.push(subscriptionPromptStep);
        }
    }

    promptSteps.push(new ConnectionsListStep(), new UserAssignedIdentityListStep());
    executeSteps.push(new SettingsAddBaseStep(), new RemoteSettingsAddStep(), new RoleAssignmentExecuteStep(() => wizardContext.roles))

    const wizard: AzureWizard<IAddMIConnectionsContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps
    });

    await wizard.prompt();
    const continueOn: MessageItem = { title: localize('continueOn', 'Continue') };
    await context.ui.showWarningMessage(localize('rolesWillBeAssignedMessage', 'This command will assign a managed identity and roles would you like to continue?'), { modal: true }, continueOn);
    await wizard.execute();

    const message: string = localize('setConnectionsProperty', 'Successfully added remote connections in order to use identity connections your application may require additional permisssions based on your code. You also may need to modify the connection property within your trigger.');
    await context.ui.showWarningMessage(message, { learnMoreLink: "https://aka.ms/AAuroke", modal: true }, continueOn);
}
