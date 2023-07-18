/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from "@microsoft/vscode-azext-utils";
import { FunctionV2WizardContext } from "../FunctionV2WizardContext";
import { WriteToFileExecuteStep } from "./WriteToFileExecuteStep";

// documentation: https://github.com/Azure/azure-functions-templates/blob/dev/Docs/Actions/ReplaceTokensInText.md
export class ReplaceTokensInTextExecuteStep<T extends FunctionV2WizardContext> extends WriteToFileExecuteStep<T> {
    public async executeAction(context: T): Promise<void> {
        const assignTo = nonNullProp(this.action, 'assignTo');
        let source: string | undefined = context[assignTo] as string | undefined;
        if (!source) {
            throw new Error(`Could not find source "${assignTo}".`);
        }

        // all tokens saved on the context are prefixed with '$('
        const assignToTokens = Object.keys(context).filter(k => k.startsWith('$('));
        for (const token of assignToTokens) {
            source = source.replace(new RegExp(this.escapeRegExp(token), 'g'), context[token] as string);
        }

        context[assignTo] = source;
    }
}
