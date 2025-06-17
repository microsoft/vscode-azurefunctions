/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RoleAssignmentExecuteStep, type Role } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { localize } from "../../../localize";
import { type FunctionAppUserAssignedIdentitiesContext } from "./FunctionAppUserAssignedIdentitiesContext";

export class FunctionAppRoleVerifyStep<T extends FunctionAppUserAssignedIdentitiesContext> extends AzureWizardExecuteStep<T> {
    priority: number = 900;

    constructor(readonly role: Role) {
        super();
    }

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number; }>): Promise<void> {
        progress.report({ message: localize('verifyingRoleAssignment', 'Verifying role "{0}"...', this.role.roleDefinitionName) });

        this.addExecuteSteps = () => [new RoleAssignmentExecuteStep(() => [this.role])];
    }

    public shouldExecute(context: T): boolean {
        return !!context.managedIdentity;
    }
}
