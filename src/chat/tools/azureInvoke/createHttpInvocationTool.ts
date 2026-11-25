/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, nonNullValue, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { randomUUID } from 'crypto';
import * as z from 'zod/mini';
import { type InvocationCollection } from '../../../azureInvoke/InvocationCollection';
import { type HttpInvocation } from '../../../azureInvoke/models/httpSchema';
import { localize } from '../../../localize';
import { httpInvocationInputSchema } from './invocationSchemas';

const createHttpInvocationToolName = 'create_http_invocation';

const createHttpInvocationOutputSchema = z.object({
    id: z.string(),
    message: z.string(),
});

export function createHttpInvocationTool(collection: InvocationCollection): CopilotTool<typeof httpInvocationInputSchema, typeof createHttpInvocationOutputSchema> {
    return {
        name: createHttpInvocationToolName,
        title: localize('azureInvoke.createHttpInvocation', 'Azure Invoke: Create API request'),
        description: 'Save a reusable HTTP request for this session and return its ID without sending it. Defaults to GET. ' +
            'Set group to place related invocations in the same folder in the Invoke view. ' +
            'Create prerequisites first. Use dependsOn for ordering, {{name}} bindings to reuse values, and {{guid}} for one UUID per run.',
        inputSchema: httpInvocationInputSchema,
        outputSchema: createHttpInvocationOutputSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
        },
        execute: async (input, extras) => {
            const result = await callWithTelemetryAndErrorHandling(`mcpTool/${createHttpInvocationToolName}/execute`, (context: IActionContext) => {
                context.errorHandling.suppressDisplay = true;
                context.errorHandling.rethrow = true;

                if (extras?.signal.aborted) {
                    throw new UserCancelledError(createHttpInvocationToolName);
                }

                const invocation = saveHttpInvocation(collection, input);
                return {
                    id: invocation.id,
                    message: localize('azureInvoke.invocationCreated', 'Created the invocation in Azure Invoke and saved it for this session. The request has not been sent.'),
                };
            });

            return nonNullValue(result, 'createdInvocation');
        },
    };
}

/**
 * Fills in missing request fields, assigns a new ID, and saves the definition without sending it.
 */
function saveHttpInvocation(collection: InvocationCollection, input: z.infer<typeof httpInvocationInputSchema>): HttpInvocation {
    const invocation: HttpInvocation = {
        id: randomUUID(),
        name: input.name.trim(),
        ...(input.group === undefined ? {} : { group: input.group.trim() }),
        request: {
            method: input.method ?? 'GET',
            url: input.url,
            headers: input.headers ?? [],
            query: input.query ?? [],
            body: input.body ?? '',
            ...(input.bindings?.length ? { bindings: input.bindings } : {}),
            ...(input.dependsOn?.length ? { dependsOn: input.dependsOn } : {}),
        },
    };

    collection.save(invocation);
    return invocation;
}
