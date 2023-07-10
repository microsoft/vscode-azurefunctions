/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { ResourceType } from "../../../templates/IBindingTemplate";
import { ParsedInput } from "../../../templates/script/parseScriptTemplatesV2";
import { FunctionWizardV2Context } from "../FunctionV2WizardContext";
import { EnumInputStep } from "./EnumInputStep";
import { ExistingFileStep } from "./ExistingFileStep";
import { NewFileStep } from "./NewFileStep";
import { StringInputStep } from "./StringInputStep";

export function promptStepFactory<T extends FunctionWizardV2Context>(input: ParsedInput): AzureWizardPromptStep<T> {
    switch (input.value) {
        case 'enum':
            return new EnumInputStep(input);
        default:
            switch (input.resource) {
                case ResourceType.ExistingFile:
                    return new ExistingFileStep(input);
                case ResourceType.NewFile:
                    return new NewFileStep(input);
                default:
                    return new StringInputStep(input);
            }
    }
}
