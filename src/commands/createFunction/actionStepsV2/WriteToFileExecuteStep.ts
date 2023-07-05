/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, nonNullProp } from "@microsoft/vscode-azext-utils";
import { FunctionWizardV2Context } from "../FunctionV2WizardContext";
import { ActionSchemaBaseStep } from "./ActionSchemaBaseStep";
import path = require("path");

export class WriteToFileExecuteStep<T extends FunctionWizardV2Context> extends ActionSchemaBaseStep<T> {
    public async executeAction(context: T): Promise<void> {
        const filePath = await this.getFilePath(context);
        await this.writeToFile(context, filePath);
    }

    protected async writeToFile(context: T, filePath: string): Promise<void> {
        const sourceKey = nonNullProp(this.action, 'source');
        const source = context[sourceKey] as string;

        // this is used by appendToFile, which is why we have to consider the existingContent
        const existingContent = await AzExtFsExtra.readFile(filePath);
        await AzExtFsExtra.writeFile(filePath, existingContent + source);
    }

    protected async getFilePath(context: T): Promise<string> {
        const filePathAssignTo = nonNullProp(this.action, 'filePath');
        const filePathMatchArray = /\$\(.*\)/.exec(filePathAssignTo);
        if (!filePathMatchArray || filePathMatchArray.length === 0) {
            throw new Error(`File path "${filePathAssignTo}" does not contain any tokens.`);
        }

        const filePathKey = filePathMatchArray[0];
        const filePathValue: string | undefined = context[filePathKey] as string | undefined;

        if (!filePathValue) {
            throw new Error();
        }

        const filePath: string = path.join(context.projectPath!, filePathValue);

        if (!await AzExtFsExtra.pathExists(filePath)) {
            await AzExtFsExtra.ensureFile(filePath);
        }

        return filePath;
    }
}

// {
//     name: "writeFile_FunctionApp",
//     type: "WriteToFile",
//     source: "$(FUNCTION_APP_CONTENT)",
//     filePath: "$(APP_FILENAME).py",
//     continueOnError: false,
//     errorText: "Unable to create the function app",
//     replaceTokens: true,
//   },
