/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput } from "@microsoft/vscode-azext-utils";
import { localize } from "../../../localize";
import { type FunctionV2WizardContext } from "../IFunctionWizardContext";

// This is just to give the ActionsSchemaSteps a human readable label as the individual parsed actions are not user-friendly and to contribute a child for create new project
export class JobNameExecuteStep<T extends FunctionV2WizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public constructor(readonly jobName: string) {
        super();
    }

    public priority: number = 500;
    public stepName = `JobNameExecuteStep`;
    public getTreeItemLabel(_context: T): string {
        return this.jobName;
    }
    public getOutputLogSuccess(_context: T): string {
        return localize('successMessage', `Successfully executed "{0}"`, this.jobName);
    }
    public getOutputLogFail(_context: T): string {
        return localize('failedMessage', `Failed to execute "{0}"`, this.jobName);
    }

    public async execute(_context: T): Promise<void> {
        // execute nothing
    }

    public shouldExecute(_context: T): boolean {
        // there is a conditions property on the action, but it is not currently used (as far as I can tell)
        return true;
    }
}
