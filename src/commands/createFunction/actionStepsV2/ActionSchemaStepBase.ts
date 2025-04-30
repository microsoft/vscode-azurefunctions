/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type ParsedAction } from "../../../templates/script/parseScriptTemplatesV2";
import { type FunctionV2WizardContext } from "../IFunctionWizardContext";

export abstract class ActionSchemaStepBase<T extends FunctionV2WizardContext> extends AzureWizardExecuteStep<T> {
    public constructor(readonly action: ParsedAction, readonly priority: number) {
        super();
    }

    public stepName = `${this.action.name}ActionSchemaStep`;
    public async execute(context: T): Promise<void> {
        try {
            await this.executeAction(context);
        } catch (err) {
            if (!this.action.continueOnError) {
                throw this.action.errorText ? new Error(this.action.errorText) : err;
            }
            // swallow error if continueOnError is true
        }
    }

    public shouldExecute(_context: T): boolean {
        // there is a conditions property on the action, but it is not currently used (as far as I can tell)
        return true;
    }

    public abstract executeAction(context: T): Promise<void>;

    protected escapeRegExp(input: string): string {
        return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}
