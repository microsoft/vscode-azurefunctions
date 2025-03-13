/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem } from "@microsoft/vscode-azext-azureappsettings";
import { AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type MessageItem } from "vscode";
import { localize } from "../../localize";
import { createActivityContext } from "../../utils/activityUtils";
import { ConnectionsListStep, type Connection } from "./ConnectionsListStep";
import { type IAddMIConnectionsContext } from "./IAddMIConnectionsContext";
import { LocalSettingsAddStep } from "./LocalSettingsAddStep";
import { SettingsAddBaseStep } from "./SettingsAddBaseStep";

export async function addLocalMIConnections(context: IActionContext, node?: AppSettingTreeItem): Promise<void> {
    const connections: Connection[] = [];
    if (node instanceof AppSettingTreeItem) {
        connections.push({ name: node.id, value: node.value });
        await node.parent.runWithTemporaryDescription(context, localize('adding', 'Adding...'), async () => {
            await addLocalMIConnectionsInternal(context, connections);
        });
    } else {
        await addLocalMIConnectionsInternal(context);
    }
}

export async function addLocalMIConnectionsInternal(context: IActionContext, connections?: Connection[]): Promise<void> {
    const wizardContext: IActionContext & Partial<IAddMIConnectionsContext> = {
        ...context,
        ...await createActivityContext()
    };

    wizardContext.connections = connections;

    wizardContext.activityChildren = [];

    const title: string = localize('addLocalMIConnectionsInternal', 'Add Identity-Based Connections to Local Project');

    const promptSteps: AzureWizardPromptStep<IAddMIConnectionsContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IAddMIConnectionsContext>[] = [];

    promptSteps.push(new ConnectionsListStep())
    executeSteps.push(new SettingsAddBaseStep(), new LocalSettingsAddStep());

    const wizard: AzureWizard<IAddMIConnectionsContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps
    });

    await wizard.prompt();
    await wizard.execute();

    const continueOn: MessageItem = { title: localize('continueOn', 'Continue') };
    const message: string = localize('setConnectionsProperty', 'Successfully added local connections in order to use identity based connections you may need to set the connection property within your trigger.'); //Todo: edit this message
    await context.ui.showWarningMessage(message, { learnMoreLink: "https://aka.ms/AAuroke", modal: true }, continueOn);
}
