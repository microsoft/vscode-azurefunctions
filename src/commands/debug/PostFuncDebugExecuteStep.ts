/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityInfoContext, AzureWizardExecuteStep, createContextValue, randomUtils, type ExecuteActivityContext, type ExecuteActivityOutput, type IActionContext } from "@microsoft/vscode-azext-utils";
import { stripVTControlCharacters } from "node:util";
import { ThemeIcon } from "vscode";

export class PostFuncDebugExecuteStep<T extends IActionContext & ExecuteActivityContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 999;
    public stepName: string = 'PostFuncDebugExecuteStep';
    // public options: AzureWizardExecuteStepOptions = {
    //     continueOnFail: true
    // }

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
            context.activityAttributes = context.activityAttributes || {};
            context.activityAttributes.logs = errorLogs.map(log => { return { content: stripVTControlCharacters(log) }; });
            context.activityChildren = [];
            throw new Error('This is from the error in execute');
        }

        return;
    }

    public shouldExecute(_context: T): boolean {
        return true;
    }

    public createFailOutput(_context: T): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: 'Click to have Copilot help diagnose the issue.',
                id: `${randomUtils.getRandomHexString(8)}-terminateDebugSession-fail`,
                activityType: ActivityChildType.Fail,
                contextValue: createContextValue([activityInfoContext, 'terminateDebugSessionFail']),
                iconPath: new ThemeIcon('sparkle'),
                // a little trick to remove the description timer on activity children
                description: ' ',
                command: {
                    "command": "azureResourceGroups.askAgentAboutActivityLogItem",
                    "title": "Ask Copilot",
                }
            })
        };
    }
}
