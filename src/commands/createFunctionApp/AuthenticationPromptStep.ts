/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type AzureWizardExecuteStep, type IAzureQuickPickOptions, type IWizardOptions } from "@microsoft/vscode-azext-utils";
import { type QuickPickItem } from "vscode";

import { UserAssignedIdentityCreateStep, UserAssignedIdentityListStep } from "@microsoft/vscode-azext-azureutils";
import { localize } from "../../localize";
import { type IFunctionAppWizardContext } from "./IFunctionAppWizardContext";

export class AuthenticationPromptStep<T extends IFunctionAppWizardContext> extends AzureWizardPromptStep<T> {
    public constructor() {
        super();
    }

    public async prompt(context: T): Promise<void> {
        const options: IAzureQuickPickOptions = { placeHolder: 'Select resource authentication type', id: `AuthenticationPromptStep` };
        context.useManagedIdentity = (await context.ui.showQuickPick(this.getQuickPicks(context), options)).label === 'Managed identity';
    }

    public shouldPrompt(context: T): boolean {
        // don't need to prompt if the user has already selected a managed identity
        return !context.managedIdentity;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        if (context.useManagedIdentity) {
            const promptSteps: AzureWizardPromptStep<T>[] = [];
            const executeSteps: AzureWizardExecuteStep<T>[] = [];
            if (context.advancedCreation) {
                promptSteps.push(new UserAssignedIdentityListStep());
            } else {
                executeSteps.push(new UserAssignedIdentityCreateStep());
            }

            return {
                promptSteps,
                executeSteps
            }
        }

        return undefined;
    }

    private getQuickPicks(_context: T): QuickPickItem[] {
        return [
            {
                label: localize('secrets', 'Secrets'),
                detail: localize('secretsDetails', 'Uses storage connection strings which may be insecure and expose sensitive credentials.')
            },
            {
                label: localize('managedIdentity', 'Managed identity'),
                detail: localize('managedIdentityDetails', 'For best security practice, use managed identity authentication when available.'),
            },
        ]
    }
}
