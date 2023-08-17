/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtOpenDialogOptions } from "@microsoft/vscode-azext-utils";
import { Uri } from "vscode";
import { Utils } from 'vscode-uri';
import { ParsedInput } from "../../../templates/script/parseScriptTemplatesV2";
import { FunctionV2WizardContext } from "../FunctionV2WizardContext";
import { getFileExtensionFromLanguage } from "../scriptSteps/ScriptFunctionCreateStep";
import { PromptSchemaStepBase } from "./PromptSchemaStepBase";

export class ExistingFileStep<T extends FunctionV2WizardContext> extends PromptSchemaStepBase<T> {
    public constructor(readonly input: ParsedInput) {
        super(input);
    }

    protected async promptAction(context: T): Promise<string> {
        // getFileExtensionFromLanguage returns a leading dot, but we don't want that here
        const fileType = getFileExtensionFromLanguage(context.language)?.substring(1);
        const options: AzExtOpenDialogOptions = {
            title: this.input.help,
            defaultUri: Utils.joinPath(Uri.file(context.projectPath), this.input.defaultValue),
            filters: fileType ? { file: [fileType] } : undefined
        };

        return Utils.basename((await context.ui.showOpenDialog(options))[0]).split('.')[0];
    }

    public shouldPrompt(context: T): boolean {
        return !context[this.input.assignTo];
    }
}
