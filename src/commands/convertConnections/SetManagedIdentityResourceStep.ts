/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IWizardOptions } from "@microsoft/vscode-azext-utils";
import { type IConvertConnectionsContext } from "./IConvertConnectionsContext";

//either set the managed identity resource or create a new one
//also add the role assignment step in subwizard step

export class SetManagedIdentityResourceStep extends AzureWizardPromptStep<IConvertConnectionsContext> {
    public async prompt(context: IConvertConnectionsContext): Promise<void> {
        //prompt for the managed identity
    }

    public shouldPrompt(context: IConvertConnectionsContext): boolean {
        return !context.managedIdentityResourceId;
    }

    public async getSubWizard(context: IConvertConnectionsContext): Promise<IWizardOptions<IConvertConnectionsContext> | undefined> {

    }
}

