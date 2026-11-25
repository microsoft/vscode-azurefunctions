/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { ConsentGuidance, type CopilotTool } from '@microsoft/vscode-inproc-mcp';
import * as z from 'zod/mini';
import { type InvocationCollection } from '../../../azureInvoke/InvocationCollection';
import { type ChainInvocationRunner } from '../../../azureInvoke/invocationRunner/ChainInvocationRunner';
import { getRequestDependencies } from '../../../azureInvoke/models/httpSchema';
import { localize } from '../../../localize';
import { buildHttpInvocationToolResult } from './buildHttpInvocationToolResult';
import { httpInvocationResponseSchema, idSchema } from './invocationSchemas';

const runHttpInvocationToolName = 'run_http_invocation';

const runHttpInvocationInputSchema = z.object({
    id: idSchema,
    runDependencies: z.optional(z.boolean()),
});

export function runHttpInvocationTool(collection: InvocationCollection, chainRunner: ChainInvocationRunner): CopilotTool<typeof runHttpInvocationInputSchema, typeof httpInvocationResponseSchema> {
    return {
        name: runHttpInvocationToolName,
        title: localize('azureInvoke.runHttpInvocation', 'Azure Invoke: Run API request'),
        description: 'Send a saved HTTP request by ID, ignoring unsaved edits. Loopback only. ' +
            'Runs prerequisites first by default. Set runDependencies to false to send only the target using prior successful prerequisite results. ' +
            'Report any reusedPrerequisiteIds as reused, not rerun. ',
        inputSchema: runHttpInvocationInputSchema,
        outputSchema: httpInvocationResponseSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
            consentGuidance: ConsentGuidance.AlwaysRequired,
        },
        execute: async (input, extras) => {
            const result = await callWithTelemetryAndErrorHandling(`mcpTool/${runHttpInvocationToolName}/execute`, async (context: IActionContext) => {
                context.errorHandling.suppressDisplay = true;
                context.errorHandling.rethrow = true;

                if (extras?.signal.aborted) {
                    throw new UserCancelledError(runHttpInvocationToolName);
                }

                // Tools run the saved snapshot even if an open tab has unsaved edits.
                const invocation = collection.get(input.id);
                if (!invocation) {
                    throw new Error(localize('azureInvoke.requestNotFound', 'This invocation is no longer in the collection.'));
                }

                const includeResponseContent = chainRunner.canShareResponseWithCopilot(invocation);
                const runDependencies = input.runDependencies ?? true;
                const response = await chainRunner.sendRequest(context, invocation, { signal: extras?.signal, saved: true, runDependencies });
                const reusedPrerequisiteIds = runDependencies ? [] : getRequestDependencies(invocation.request);
                return {
                    ...buildHttpInvocationToolResult(response, includeResponseContent),
                    ...(reusedPrerequisiteIds.length ? { reusedPrerequisiteIds } : {}),
                };
            });

            // Azure Tools handles cancellation without rethrowing it, even when rethrow is enabled.
            if (!result) {
                throw new UserCancelledError(runHttpInvocationToolName);
            }

            return result;
        },
    };
}
