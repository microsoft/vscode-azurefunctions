/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InputBoxOptions } from "vscode";
import { AzureWizardPromptStep } from "vscode-azureextensionui";
import { localize } from "../../../localize";
import { IJavaProjectWizardContext } from "./IJavaProjectWizardContext";

export class JavaProjectVersionStep extends AzureWizardPromptStep<IJavaProjectWizardContext> {
    public async prompt(context: IJavaProjectWizardContext): Promise<void> {
        const options: InputBoxOptions = {
            placeHolder: localize('versionPlaceHolder', 'Version'),
            prompt: localize('versionPrompt', 'Provide a version for your project'),
            value: '1.0-SNAPSHOT'
        };
        context.javaProjectVersion = await context.ui.showInputBox(options);
    }

    public shouldPrompt(context: IJavaProjectWizardContext): boolean {
        return !context.javaProjectVersion;
    }
}
