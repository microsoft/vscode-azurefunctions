/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityInfoContext, AzureWizardExecuteStep, createContextValue, type ExecuteActivityOutput, type IActionContext } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";

export class PostFuncDebugExecuteStep<T extends IActionContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 999;
    public stepName: string = 'PostFuncDebugExecuteStep';

    public async execute(_context: T): Promise<void> {
        // no-op
    }

    public createSuccessOutput(context: T): ExecuteActivityOutput {
        const terminateDebugSession: string = localize('connectMcpServer', 'Successfully terminated debug session.');
        return {
            item: new ActivityChildItem({
                label: terminateDebugSession,
                id: `${context.telemetry.properties.sessionId}-terminateDebugSession`,
                activityType: ActivityChildType.Success,
                contextValue: createContextValue([activityInfoContext, 'terminateDebugSession']),
                // a little trick to remove the description timer on activity children
                description: ' '
            })
        };
    }

    public createFailOutput(context: T): ExecuteActivityOutput {
        const terminateDebugSession: string = localize('terminateDebugSessionFail', 'Failed to terminate debug session.');
        return {
            item: new ActivityChildItem({
                label: terminateDebugSession,
                id: `${context.telemetry.properties.sessionId}-terminateDebugSession-fail`,
                activityType: ActivityChildType.Error,
                contextValue: createContextValue([activityInfoContext, 'terminateDebugSessionFail']),
                // a little trick to remove the description timer on activity children
                description: ' '
            })
        };
    }

    public shouldExecute(context: T): boolean {
        return true;
    }
}
