/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InputBoxOptions } from "vscode";
import { AzureWizardPromptStep } from "vscode-azureextensionui";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { IJavaProjectWizardContext, validateMavenIdentifier } from "./IJavaProjectWizardContext";

export class JavaGroupIdStep extends AzureWizardPromptStep<IJavaProjectWizardContext> {
    public async prompt(context: IJavaProjectWizardContext): Promise<void> {
        const options: InputBoxOptions = {
            placeHolder: localize('groupIdPlaceholder', 'Group id'),
            prompt: localize('groupIdPrompt', 'Provide a group id'),
            validateInput: validateMavenIdentifier,
            value: 'com.function'
        };
        context.javaGroupId = await ext.ui.showInputBox(options);
    }

    public shouldPrompt(context: IJavaProjectWizardContext): boolean {
        return !context.javaGroupId;
    }
}
