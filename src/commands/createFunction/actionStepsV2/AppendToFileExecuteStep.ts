/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";
import { FunctionWizardV2Context } from "../FunctionV2WizardContext";
import { WriteToFileExecuteStep } from "./WriteToFileExecuteStep";

export class AppendToFileExecuteStep<T extends FunctionWizardV2Context> extends WriteToFileExecuteStep<T> {
    public async executeAction(context: T): Promise<void> {
        const filePath = await this.getFilePath(context);
        await this.writeToFile(context, filePath);
    }

    protected async writeToFile(context: T, filePath: string): Promise<void> {
        const existingContent = await AzExtFsExtra.readFile(filePath);
        // NOTE: AzExtFsExtra doesn't have fs-extra's handy appendFile() function.
        // NOTE: We add two (end-of-)lines to ensure an empty line between functions definitions for function_body.
        await AzExtFsExtra.writeFile(filePath, existingContent + '\r\n\r\n');
        await super.writeToFile(context, filePath);
    }
}

// {
//     name: "appendFileContent_BlueprintBody",
//     type: "AppendToFile",
//     source: "$(BLUEPRINT_BODY_CONTENT)",
//     filePath: "$(BLUEPRINT_FILENAME).py",
//     continueOnError: false,
//     errorText: "Unable to create the Blueprint",
//     replaceTokens: true,
// },
