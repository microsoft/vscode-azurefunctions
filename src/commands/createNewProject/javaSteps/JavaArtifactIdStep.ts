/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { InputBoxOptions } from "vscode";
import { AzureWizardPromptStep } from "vscode-azureextensionui";
import { ext } from "../../../extensionVariables";
import { localize } from "../../../localize";
import { IJavaProjectWizardContext, validateMavenIdentifier } from "./IJavaProjectWizardContext";

export class JavaArtifactIdStep extends AzureWizardPromptStep<IJavaProjectWizardContext> {
    public async prompt(context: IJavaProjectWizardContext): Promise<void> {
        const options: InputBoxOptions = {
            placeHolder: localize('artifactIdPlaceholder', 'Artifact id'),
            prompt: localize('artifactIdPrompt', 'Provide an artifact id'),
            validateInput: validateMavenIdentifier,
            value: path.basename(context.projectPath)
        };
        context.javaArtifactId = await ext.ui.showInputBox(options);
    }

    public shouldPrompt(context: IJavaProjectWizardContext): boolean {
        return !context.javaArtifactId;
    }
}
