/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { assertTemplateIsV2 } from "../../../utils/templateVersionUtils";
import { FunctionV2WizardContext } from "../IFunctionWizardContext";
import { ActionSchemaStepBase } from "./ActionSchemaStepBase";

export class GetTemplateFileContentExecuteStep<T extends FunctionV2WizardContext> extends ActionSchemaStepBase<T> {
    public async executeAction(context: T): Promise<void> {
        const filePath = nonNullProp(this.action, 'filePath');
        assertTemplateIsV2(context.functionTemplate);
        let source: string | undefined = context.functionTemplate.files[filePath];
        if (!source) {
            throw new Error(localize('templateNotFound', `Could not find file "${filePath}" in template`));
        }

        /**
         * Technically, this should be done by the action [ReplaceTokenInText](https://github.com/Azure/azure-functions-templates/blob/dev/Docs/Actions/ReplaceTokensInText.md)
         * But as of today, no job contain this action, so it needs to happen when we get the template file content.
         */
        // all tokens saved on the context are prefixed with '$('
        const assignToTokens = Object.keys(context).filter(k => k.startsWith('$('));
        for (const token of assignToTokens) {
            source = source.replace(new RegExp(this.escapeRegExp(token), 'g'), context[token] as string);
        }

        const assignTo = nonNullProp(this.action, 'assignTo');
        context[assignTo] = source;
    }
}
