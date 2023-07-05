/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtInputBoxOptions, AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { ParsedInput } from "../../../templates/script/parseScriptTemplatesV2";
import { FunctionWizardV2Context } from "../FunctionV2WizardContext";

export class PromptSchemaBaseStep<T extends FunctionWizardV2Context> extends AzureWizardPromptStep<T> {

    public constructor(readonly input: ParsedInput) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        context[this.input.assignTo] = await this.promptAction(context);
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
        if (!input) {
            return localize('promptV2StepEmpty', 'The input cannot be empty.');
        }

        const validators = this.input.validators || [];
        for (const validator of validators) {
            if (new RegExp(validator.expression).test(input)) {
                return validator.errorText;
            }
        }

        return undefined;
    }

    public shouldPrompt(context: T): boolean {
        return this.input.required && !context[this.input.assignTo];
    }

    // value used to determine the prompt (string = input, boolean/enum = quickpick)
    // if required is false, then add a skip for now (for quickpick only)

    // resource types
    // Existingfile needs to open a file dialog


}
