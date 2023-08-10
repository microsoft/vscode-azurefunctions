/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, nonNullProp } from "@microsoft/vscode-azext-utils";
import { FunctionV2WizardContext } from "../FunctionV2WizardContext";
import { WriteToFileExecuteStep } from "./WriteToFileExecuteStep";

export class AppendToFileExecuteStep<T extends FunctionV2WizardContext> extends WriteToFileExecuteStep<T> {
    protected async writeToFile(context: T, filePath: string): Promise<void> {
        const sourceKey = nonNullProp(this.action, 'source');
        const source = context[sourceKey] as string;

        await AzExtFsExtra.appendFile(filePath, source);
    }
}
