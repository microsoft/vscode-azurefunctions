/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from "@microsoft/vscode-azext-utils";
import { FunctionV2WizardContext } from "../FunctionV2WizardContext";
import { ActionSchemaBaseStep } from "./ActionSchemaBaseStep";

export class GetTemplateFileContentExecuteStep<T extends FunctionV2WizardContext> extends ActionSchemaBaseStep<T> {
    public async executeAction(context: T): Promise<void> {
        const filePath = nonNullProp(this.action, 'filePath');
        let source: string | undefined = context.functionTemplateV2?.files[filePath];
        if (!source) {
            throw new Error(`Could not find file "${filePath}" in template`);
        }

        // all tokens saved on the context are prefixed with '$('
        const assignToTokens = Object.keys(context).filter(k => k.startsWith('$('));
        for (const token of assignToTokens) {
            source = source.replace(new RegExp(this.escapeRegExp(token), 'g'), context[token] as string);
        }

        const assignTo = nonNullProp(this.action, 'assignTo');
        context[assignTo] = source;
    }
}
