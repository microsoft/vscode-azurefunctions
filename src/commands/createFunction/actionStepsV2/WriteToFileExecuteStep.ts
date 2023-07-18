/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, nonNullProp } from "@microsoft/vscode-azext-utils";
import * as path from 'path';
import { Uri, window, workspace } from "vscode";
import { FunctionV2WizardContext } from "../FunctionV2WizardContext";
import { getFileExtensionFromLanguage } from "../scriptSteps/ScriptFunctionCreateStep";
import { ActionSchemaBaseStep } from "./ActionSchemaBaseStep";

export class WriteToFileExecuteStep<T extends FunctionV2WizardContext> extends ActionSchemaBaseStep<T> {
    public async executeAction(context: T): Promise<void> {
        context.newFilePath = await this.getFilePath(context);
        await this.writeToFile(context, context.newFilePath);
        await window.showTextDocument(await workspace.openTextDocument(Uri.file(context.newFilePath)));
    }

    protected async writeToFile(context: T, filePath: string): Promise<void> {
        const sourceKey = nonNullProp(this.action, 'source');
        const source = context[sourceKey] as string;

        await AzExtFsExtra.writeFile(filePath, source);
    }

    protected async getFilePath(context: T): Promise<string> {
        // sometimes this has the file extension, sometimes it doesn't
        const filePathKey = nonNullProp(this.action, 'filePath').split('.')[0];
        const filePathValue: string | undefined = context[filePathKey] as string | undefined;

        if (!filePathValue) {
            throw new Error();
        }
        const fileExtension = getFileExtensionFromLanguage(context.language);
        const fullFilePath: string = path.join(context.projectPath, `${filePathValue}${fileExtension ?? ''}`);
        if (!await AzExtFsExtra.pathExists(fullFilePath)) {
            await AzExtFsExtra.ensureFile(fullFilePath);
        }

        return fullFilePath;
    }
}
