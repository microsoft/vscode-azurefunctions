/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityInfoContext, AzureWizardExecuteStep, createContextValue, randomUtils, type ExecuteActivityContext, type ExecuteActivityOutput } from "@microsoft/vscode-azext-utils";
import { stripVTControlCharacters } from "node:util";

export class PostFuncDebugExecuteStep<T extends ExecuteActivityContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 999;
    public stepName: string = 'PostFuncDebugExecuteStep';

    public constructor(readonly logs: string[]) {
        super();
    }

    public async execute(context: T): Promise<void> {
        const errorLogs: string[] = [];
        const redAnsiRegex = /\x1b\[(?:[0-9;]*31m|[0-9;]*91m|38;5;(9|1)m)/;
        const functionErrors = [
            /No job functions found/i,
            /Worker was unable to load entry point/i,
            /SyntaxError:/i,
            /Cannot find module/i,
            /Failed to start Worker Channel/i,
            /Serialization and deserialization.*not supported/i
        ];
        for (const log of this.logs) {
            if (redAnsiRegex.test(log) || functionErrors.some(err => err.test(log))) {
                errorLogs.push(log);
            }
        }

        if (errorLogs.length > 0) {
            this._logs = stripVTControlCharacters(errorLogs.join('\n'));
            context.activityAttributes = context.activityAttributes || {};
            context.activityAttributes.logs = errorLogs.map(log => { return { content: stripVTControlCharacters(log) }; });
            throw new Error('Function host encountered errors during startup. See logs for details.');
        }

        return;
    }

    public shouldExecute(_context: T): boolean {
        return true;
    }

    public createFailOutput(_context: T): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: 'Function host encountered errors during debugging. Click to have Copilot help diagnose the issue.',
                id: `${randomUtils.getRandomHexString(8)}-terminateDebugSession-fail`,
                activityType: ActivityChildType.Error,
                contextValue: createContextValue([activityInfoContext, 'terminateDebugSessionFail']),
                // a little trick to remove the description timer on activity children
                description: ' '
            })
        };
    }
}
