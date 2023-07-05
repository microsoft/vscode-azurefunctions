/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from "@microsoft/vscode-azext-utils";
import { FunctionWizardV2Context } from "../FunctionV2WizardContext";
import { ActionSchemaBaseStep } from "./ActionSchemaBaseStep";

export class GetTemplateFileContentExecuteStep<T extends FunctionWizardV2Context> extends ActionSchemaBaseStep<T> {
    public async executeAction(context: T): Promise<void> {
        const filePath = nonNullProp(this.action, 'filePath');
        const source: string | undefined = context.functionTemplateV2?.files[filePath];
        if (!source) {
            throw new Error(`Could not find file "${filePath}" in template`);
        }

        const assignTo = nonNullProp(this.action, 'assignTo');
        context[assignTo] = source;
    }
}
