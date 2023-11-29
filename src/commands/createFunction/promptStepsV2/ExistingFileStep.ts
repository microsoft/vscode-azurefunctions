/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type AzExtOpenDialogOptions } from "@microsoft/vscode-azext-utils";
import { Uri } from "vscode";
import { Utils } from 'vscode-uri';
import { JobType, type ParsedInput } from "../../../templates/script/parseScriptTemplatesV2";
import { type FunctionV2WizardContext } from "../IFunctionWizardContext";
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

        // remove file extension (if any);
        return Utils.basename((await context.ui.showOpenDialog(options))[0]).split('.')[0];
    }

    public async configureBeforePrompt(context: T): Promise<void> {
        // if this is appending to main file, use the default file value if path exists
        if (context.job?.type === JobType.AppendToFile) {
            if (await AzExtFsExtra.pathExists(Utils.joinPath(Uri.file(context.projectPath), this.input.defaultValue))) {
                // remove file extension (if any);
                context[this.input.assignTo] = this.input.defaultValue.split('.')[0];
            }
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context[this.input.assignTo];
    }
}
