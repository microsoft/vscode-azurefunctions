/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzExtInputBoxOptions } from "@microsoft/vscode-azext-utils";
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
            validateInput: value => { return this.validateInput(value, this.input); }
        };

        return await context.ui.showInputBox(options);
    }
}
