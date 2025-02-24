/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { RoleAssignmentExecuteStep, UserAssignedIdentityListStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { createActivityContext } from "../../utils/activityUtils";
import { pickFunctionApp } from "../../utils/pickFunctionApp";
import { ConvertSettingsStep } from "./ConvertSettingsStep";
import { type IConvertConnectionsContext } from "./IConvertConnectionsContext";
import { SelectConnectionsStep } from "./SelectConnectionsStep";

export async function convertRemoteConnections(context: IActionContext): Promise<void> {
    const wizardContext: IActionContext & Partial<IConvertConnectionsContext> = {
        ...context,
        local: false,
        ...await createActivityContext()
    }

    wizardContext.activityChildren = [];

    const title: string = localize('convertRemoteConnections', 'Convert Function App Connections to Identity-Based Connections');

    const promptSteps: AzureWizardPromptStep<IConvertConnectionsContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IConvertConnectionsContext>[] = [];

    if (!wizardContext.functionapp) {
        wizardContext.functionapp = await pickFunctionApp(wizardContext)
    }

    promptSteps.push(new SelectConnectionsStep(), new UserAssignedIdentityListStep());
    executeSteps.push(new ConvertSettingsStep(), new RoleAssignmentExecuteStep(() => wizardContext.roles))

    const wizard: AzureWizard<IConvertConnectionsContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps
    });

    await wizard.prompt();
    await wizard.execute();

}
