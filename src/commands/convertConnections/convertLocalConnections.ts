/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { UserAssignedIdentityCreateStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { createActivityContext } from "../../utils/activityUtils";
import { ConfirmRoleAssignmnetStep } from "./ConfirmRoleAssignmentStep";
import { type IConvertConnectionsContext } from "./IConvertConnectionsContext";
import { SelectConnectionsStep } from "./SelectConnectionsStep";

export async function convertLocalConnections(context: IActionContext): Promise<void> {
    const wizardContext: IConvertConnectionsContext = {
        ...context,
        ...await createActivityContext()
    }

    const title: string = localize('convertLocalConnections', 'Convert Local Project Connections to Identity-Based Connections');

    const wizard: AzureWizard<IActionContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps: [new SelectConnectionsStep(), new ConfirmRoleAssignmnetStep()], //TODO: add steps (resource group step.)
        executeSteps: [new UserAssignedIdentityCreateStep()] //TODO: only do userAssignedIdentityCreateStep if their isn't already a user assigned identity
    });

    //TODO: add loading symbol to the settings tree item??

    await wizard.prompt();
    await wizard.execute();
}
