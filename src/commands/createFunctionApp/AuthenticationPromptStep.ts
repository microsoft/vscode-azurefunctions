/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserAssignedIdentityListStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizardPromptStep, type IAzureQuickPickOptions, type IWizardOptions } from "@microsoft/vscode-azext-utils";
import { type QuickPickItem } from "vscode";

import { localize } from "../../localize";
import { type IFunctionAppWizardContext } from "./IFunctionAppWizardContext";

export class AuthenticationPromptStep<T extends IFunctionAppWizardContext> extends AzureWizardPromptStep<T> {
    private _useManagedIdentity: boolean = false;
    public constructor() {
        super();
    }

    public async prompt(wizardContext: T): Promise<void> {
        const options: IAzureQuickPickOptions = { placeHolder: 'Select resource authentication type', id: `AuthenticationPromptStep` };
        this._useManagedIdentity = (await wizardContext.ui.showQuickPick(this.getQuickPicks(wizardContext), options)).label === 'Managed identity';
    }

    public shouldPrompt(wizardContext: T): boolean {
        // don't need to prompt if the user has already selected a managed identity
        return !wizardContext.managedIdentity;
    }

    public async getSubWizard(_wizardContext: T): Promise<IWizardOptions<T> | undefined> {
        if (this._useManagedIdentity) {
            return {
                promptSteps: [new UserAssignedIdentityListStep()],
                executeSteps: [],
            }
        }

        return undefined;
    }

    private getQuickPicks(_wizardContext: T): QuickPickItem[] {
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
