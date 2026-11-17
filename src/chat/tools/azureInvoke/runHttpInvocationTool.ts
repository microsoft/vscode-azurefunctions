/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { ConsentGuidance, type CopilotTool } from '@microsoft/vscode-inproc-mcp';
import * as z from 'zod/mini';
import { localize } from '../../../localize';
import { type HttpInvocationRunner } from '../../../azureInvoke/HttpInvocationRunner';
import { type InvocationCollection } from '../../../azureInvoke/InvocationCollection';
import { getShareableHttpResponse } from '../../../azureInvoke/sendHttpRequest';
import { httpInvocationResponseSchema, idSchema } from './invocationSchemas';

const runHttpInvocationToolName = 'run_http_invocation';

const runHttpInvocationInputSchema = z.object({
    id: idSchema,
    runDependencies: z.optional(z.boolean()),
});

export function runHttpInvocationTool(collection: InvocationCollection, runner: HttpInvocationRunner): CopilotTool<typeof runHttpInvocationInputSchema, typeof httpInvocationResponseSchema> {
    return {
        name: runHttpInvocationToolName,
        title: localize('azureInvoke.runHttpInvocation', 'Azure Invoke: Run API request'),
        description: 'Test an HTTP API or Azure Functions HTTP endpoint using a saved Azure Invoke request. ' +
            'Call list_http_invocations to find saved requests by name. ' +
            'Send the invocation by its ID, such as the ID returned by create_http_invocation. ' +
            'Use the saved session snapshot, not unsaved editor changes. This makes a real HTTP request and can modify local application data. ' +
            'Only localhost, 127.x.x.x, and [::1] targets can be sent for now. A chain containing any other host is rejected before any request in it is sent. ' +
            'By default, execute all prerequisites in dependency order, once each, then the target so generated data and linked IDs are ready. Set runDependencies false only to reuse current successful prerequisite results. ' +
            'This can create, update, or delete data in every prerequisite. Explain the chain and obtain approval for all of it before execution. ' +
            'Stop on a failed prerequisite, missing response field, cycle, or cancellation. No stale outputs are reused. ' +
            'Ask for user approval before running. Return HTTP status and duration in milliseconds. ' +
            'Only localhost and literal loopback targets also return the complete response body, up to 5 MB, and selected non-sensitive headers. ' +
            'For all other targets, or any chain with a non-local prerequisite, do not return any response body or headers to AI. ' +
            'Update progress in the Azure Invoke tree without opening a tab. Full results are available when the user opens the request. ' +
            'Local response bodies may contain sensitive data. Redirects are not followed and requests are not retried.',
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
                context.telemetry.maskEntireErrorMessage = true;
                context.errorHandling.suppressDisplay = true;
                context.errorHandling.rethrow = true;

                if (extras?.signal.aborted) {
                    throw new UserCancelledError(runHttpInvocationToolName);
                }

                const invocation = collection.get(input.id);
                if (!invocation) {
                    throw new Error(localize('azureInvoke.requestNotFound', 'This invocation is no longer in the collection.'));
                }

                const shareResponse = runner.canShareResponse(invocation);
                const response = await runner.send(context, invocation, { signal: extras?.signal, saved: true, runDependencies: input.runDependencies ?? true });
                return getShareableHttpResponse(response, shareResponse);
            });

            // Azure Tools handles cancellation without rethrowing it, even when rethrow is enabled.
            if (!result) {
                throw new UserCancelledError(runHttpInvocationToolName);
            }

            return result;
        },
    };
}
