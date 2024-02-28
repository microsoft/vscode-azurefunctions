/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { ResourceType } from "../../../templates/IBindingTemplate";
import { type ParsedInput } from "../../../templates/script/parseScriptTemplatesV2";
import { LocalAppSettingListStep } from "../../addBinding/settingSteps/LocalAppSettingListStep";
import { type FunctionV2WizardContext } from "../IFunctionWizardContext";
import { BooleanInputStep } from "./BooleanInputStep";
import { EnumInputStep } from "./EnumInputStep";
import { ExistingFileStep } from "./ExistingFileStep";
import { NewFileStep } from "./NewFileStep";
import { StringInputStep } from "./StringInputStep";

export function promptStepFactory<T extends FunctionV2WizardContext>(input: ParsedInput): AzureWizardPromptStep<T> {
    switch (input.value) {
        case 'enum':
            return new EnumInputStep(input);
        case 'boolean':
            return new BooleanInputStep(input);
        default:
            switch (input.resource) {
                case ResourceType.ExistingFile:
                    return new ExistingFileStep(input);
                case ResourceType.NewFile:
                    return new NewFileStep(input);
                default:
                    if (input.resource) {
                        return new LocalAppSettingListStep(input);
                    } else {
                        return new StringInputStep(input);
                    }
            }
    }
}
