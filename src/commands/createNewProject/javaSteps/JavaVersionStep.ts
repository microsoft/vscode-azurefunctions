/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InputBoxOptions } from "vscode";
import { AzureWizardPromptStep } from "vscode-azureextensionui";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { IJavaProjectWizardContext } from "./IJavaProjectWizardContext";

export class JavaVersionStep extends AzureWizardPromptStep<IJavaProjectWizardContext> {
    public async prompt(wizardContext: IJavaProjectWizardContext): Promise<void> {
        const options: InputBoxOptions = {
            placeHolder: localize('versionPlaceHolder', 'Version'),
            prompt: localize('versionPrompt', 'Provide a version'),
            value: '1.0-SNAPSHOT'
        };
        wizardContext.javaVersion = await ext.ui.showInputBox(options);
    }

    public shouldPrompt(wizardContext: IJavaProjectWizardContext): boolean {
        return !wizardContext.javaVersion;
    }
}
