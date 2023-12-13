/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzExtInputBoxOptions } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { type ParsedInput } from "../../../templates/script/parseScriptTemplatesV2";
import { type FunctionV2WizardContext } from "../IFunctionWizardContext";
import { PromptSchemaStepBase } from "./PromptSchemaStepBase";

export class StringInputStep<T extends FunctionV2WizardContext> extends PromptSchemaStepBase<T> {

    public constructor(readonly input: ParsedInput) {
        super(input);
    }

    protected async promptAction(context: T): Promise<string> {
        const options: AzExtInputBoxOptions = {
            title: this.input.label,
            prompt: this.input.help,
            value: this.input.defaultValue,
            validateInput: this.validateInput
        };

        return await context.ui.showInputBox(options);
    }

    protected validateInput(input: string | undefined): string | undefined {
        if (!input && this.input.required) {
            return localize('promptV2StepEmpty', 'The input cannot be empty.');
        }

        const validators = this.input.validators || [];
        for (const validator of validators) {
            if (input) {
                if (!new RegExp(validator.expression).test(input)) {
                    return validator.errorText;
                }
            }
        }

        return undefined;
    }
}
