/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, nonNullProp } from "@microsoft/vscode-azext-utils";
import { FunctionWizardV2Context } from "../FunctionV2WizardContext";
import { WriteToFileExecuteStep } from "./WriteToFileExecuteStep";

export class ReplaceTokensInTextExecuteStep<T extends FunctionWizardV2Context> extends WriteToFileExecuteStep<T> {
    public async executeAction(context: T): Promise<void> {
        const filePath = nonNullProp(this.action, 'filePath');

        if (!await AzExtFsExtra.pathExists(filePath)) {
            if (this.action.createIfNotExists) {
                await AzExtFsExtra.ensureFile(filePath);
            } else {
                throw new Error(`File "${filePath}" does not exist.`);
            }
        }

        let content = await AzExtFsExtra.readFile(filePath);
        // NOTE: AzExtFsExtra doesn't have fs-extra's handy appendFile() function.
        // NOTE: We add two (end-of-)lines to ensure an empty line between functions definitions for function_body.
        content = (content + '\r\n\r\n');

        await this.writeToFile(context, content);
    }
}

//     {
//       name: "replaceText_FunctionBody",
//       type: "ReplaceTokensInText",
//       assignTo: "$(TIMER_FUNCTION_BODY)",
//       source: "$(TIMER_FUNCTION_BODY)",
//     }
