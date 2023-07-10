/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzExtInputBoxOptions } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { JobType } from "../../../templates/script/parseScriptTemplatesV2";
import { FunctionWizardV2Context } from "../FunctionV2WizardContext";
import { StringInputStep } from "./StringInputStep";
import path = require("path");

export class NewFileStep<T extends FunctionWizardV2Context> extends StringInputStep<T> {
    protected async promptAction(context: T): Promise<string> {
        const options: AzExtInputBoxOptions = {
            title: this.input.label,
            prompt: this.input.help,
            value: this.input.defaultValue,
            validateInput: (input) => this.validateInputCore(context, input),
        };

        const fileName = await context.ui.showInputBox(options);
        return fileName.split('.')[0]; // remove file extension (if any)
    }

    public shouldPrompt(context: T): boolean {
        return !context[this.input.assignTo];
    }

    protected async validateInputCore(context: FunctionWizardV2Context, input: string | undefined): Promise<string | undefined> {
        const error = super.validateInput(input);
        if (error) {
            return error;
        }

        if (input) {
            return await this.validateFunctionNameCore(context, input);
        }

        return undefined;
    }

    protected async validateFunctionNameCore(context: FunctionWizardV2Context, name: string): Promise<string | undefined> {
        // if this is a new project, then we should overwrite the file
        if (context.job?.type !== JobType.CreateNewApp) {
            return undefined;
        } else if (await AzExtFsExtra.pathExists(path.join(context.projectPath, name))) {
            return localize('existingFileError', 'A file with the name "{0}" already exists.', name);
        } else {
            return undefined;
        }
    }
}
