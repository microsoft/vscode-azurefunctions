/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem, type AppSettingsTreeItem } from "@microsoft/vscode-azext-azureappsettings";
import { RoleAssignmentExecuteStep, UserAssignedIdentityListStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, nonNullProp, type AzureWizardExecuteStep, type AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { type MessageItem } from "vscode";
import { localize } from "../../localize";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { createActivityContext } from "../../utils/activityUtils";
import { pickFunctionApp } from "../../utils/pickFunctionApp";
import { type AddMIConnectionsContext } from "./AddMIConnectionsContext";
import { ConnectionsListStep, type Connection } from "./ConnectionsListStep";
import { RemoteSettingsAddStep } from "./RemoteSettingsAddStep";
import { SettingsAddBaseStep } from "./SettingsAddBaseStep";

export async function addRemoteMIConnections(context: AddMIConnectionsContext, node?: AppSettingTreeItem | AppSettingsTreeItem): Promise<void> {
    const connections: Connection[] = [];
    if (!node) {
        context.functionapp = await pickFunctionApp(context);
        await context.functionapp.initSite(context);
        await addRemoteMIConnectionsInternal(context, connections);
    } else {
        if (node instanceof AppSettingTreeItem) {
            context.functionapp = node?.parent.parent as SlotTreeItem;
            connections.push({ name: node.id, value: node.value });
            node = node.parent;
        } else {
            context.functionapp = node?.parent as SlotTreeItem
        }
        await node.runWithTemporaryDescription(context, localize('adding', 'Adding...'), async () => {
            await addRemoteMIConnectionsInternal(context, connections);
        });
    }
}

export async function addRemoteMIConnectionsInternal(context: AddMIConnectionsContext, connections?: Connection[]): Promise<void> {
    const wizardContext: AddMIConnectionsContext = {
        ...context,
        ...await createActivityContext()
    };

    wizardContext.connections = connections;

    wizardContext.activityChildren = [];

    const title: string = localize('addRemoteConnections', 'Add Function App Identity Connections');

    const promptSteps: AzureWizardPromptStep<AddMIConnectionsContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<AddMIConnectionsContext>[] = [];

    if (!wizardContext.environment) {
        wizardContext.credentials = nonNullProp(wizardContext, 'functionapp').subscription.credentials;
        wizardContext.environment = nonNullProp(wizardContext, 'functionapp').subscription.environment;
        wizardContext.subscriptionId = nonNullProp(wizardContext, 'functionapp').subscription.subscriptionId;
    }

    promptSteps.push(new ConnectionsListStep(), new UserAssignedIdentityListStep());
    executeSteps.push(new SettingsAddBaseStep(), new RemoteSettingsAddStep(), new RoleAssignmentExecuteStep(() => wizardContext.roles))

    const wizard: AzureWizard<AddMIConnectionsContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps
    });

    await wizard.prompt();
    const continueOn: MessageItem = { title: localize('continueOn', 'Continue') };
    await context.ui.showWarningMessage(localize('rolesWillBeAssignedMessage', 'This command will assign a managed identity and roles. Would you like to continue?'), { modal: true }, continueOn);
    await wizard.execute();

    const confirm: MessageItem = { title: localize('confirm', 'Confirm') };
    const message: string = localize('setConnectionsProperty', 'Successfully added remote connections. In order to use identity connections, your application may require additional permissions based on your code. You also may need to modify the connection property within your trigger.');
    await context.ui.showWarningMessage(message, { learnMoreLink: "https://aka.ms/AAuroke", modal: true }, confirm);
}
