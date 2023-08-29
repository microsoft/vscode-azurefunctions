/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { ParsedInput } from "../../../templates/script/parseScriptTemplatesV2";
import { FunctionV2WizardContext } from "../FunctionV2WizardContext";

export abstract class PromptSchemaStepBase<T extends FunctionV2WizardContext> extends AzureWizardPromptStep<T> {

    public constructor(readonly input: ParsedInput) {
        super();
    }

    public async prompt(context: T): Promise<void> {
        context[this.input.assignTo] = await this.promptAction(context);
    }

    protected abstract promptAction(context: T): Promise<unknown>;

    protected validateInput(input: string | undefined): string | undefined {
        if (!input && this.input.required) {
            return localize('promptV2StepEmpty', 'The input cannot be empty.');
        }

        const validators = this.input.validators || [];
        for (const validator of validators) {
            if (input) {
                if (new RegExp(validator.expression).test(input)) {
                    return validator.errorText;
                }
            }
        }

        return undefined;
    }

    public shouldPrompt(context: T): boolean {
        return !context[this.input.assignTo];
    }
}
