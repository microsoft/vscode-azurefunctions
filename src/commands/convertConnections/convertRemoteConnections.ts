/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type AppSettingTreeItem } from "@microsoft/vscode-azext-azureappsettings";
import { RoleAssignmentExecuteStep, UserAssignedIdentityListStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { createActivityContext } from "../../utils/activityUtils";
import { pickFunctionApp } from "../../utils/pickFunctionApp";
import { ConvertSettingsStep } from "./ConvertSettingsStep";
import { type IConvertConnectionsContext } from "./IConvertConnectionsContext";
import { SelectConnectionsStep, type Connection } from "./SelectConnectionsStep";

export async function convertRemoteConnections(context: IActionContext, node?: AppSettingTreeItem): Promise<void> {
    const connections: Connection[] = []
    if (node) {
        await node.runWithTemporaryDescription(context, localize('converting', 'Converting...'), async () => {
            await convertRemoteConnectionsInternal(context, connections, node);
        });
    } else {
        await convertRemoteConnectionsInternal(context);
    }
}

export async function convertRemoteConnectionsInternal(context: IActionContext, connections?: Connection[], node?: AppSettingTreeItem): Promise<void> {
    const wizardContext: IActionContext & Partial<IConvertConnectionsContext> = {
        ...context,
        local: false,
        ...await createActivityContext()
    };

    wizardContext.connections = connections;

    wizardContext.activityChildren = [];

    const title: string = localize('convertRemoteConnections', 'Convert Function App Connections to Identity-Based Connections');

    const promptSteps: AzureWizardPromptStep<IConvertConnectionsContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IConvertConnectionsContext>[] = [];


    wizardContext.functionapp = node?.parent.parent as SlotTreeItem ?? await pickFunctionApp(wizardContext)

    promptSteps.push(new SelectConnectionsStep(), new UserAssignedIdentityListStep());
    executeSteps.push(new ConvertSettingsStep(), new RoleAssignmentExecuteStep(() => wizardContext.roles))

    const wizard: AzureWizard<IConvertConnectionsContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps
    });

    await wizard.prompt();
    await wizard.execute();

    const message: string = localize('setConnectionsProperty', 'Successfully converted remote connections in order to use identity based connections you may need to set the connection property within your trigger.');
    await context.ui.showWarningMessage(message, { learnMoreLink: "https://aka.ms/AAuroke", modal: true },);
}
