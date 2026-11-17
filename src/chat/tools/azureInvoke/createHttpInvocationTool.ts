/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { callWithTelemetryAndErrorHandling, nonNullValue, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type CopilotTool } from '@microsoft/vscode-inproc-mcp';
import * as z from 'zod/mini';
import { localize } from '../../../localize';
import { type InvocationCollection } from '../../../azureInvoke/InvocationCollection';
import { type HttpInvocation } from '../../../webviews/azureInvoke/shared/httpRequest';
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
        description: 'Create a reusable HTTP API test request in the Azure Functions extension\'s Azure Invoke collection, instead of an ad hoc curl request. ' +
            'Provide a name and an HTTP or HTTPS URL. Optionally fill in the method, headers, query parameters, and raw body. ' +
            'The method defaults to GET. Put authentication in headers, not in URL credentials. ' +
            'For request chaining, create prerequisite requests first. Optional bindings link {name, sourceId, pointer} to a saved source request, ' +
            'using JSON Pointer selectors such as /body/id, /headers/location, /status, or /request/body/email to reuse the actual input sent by a source request. ' +
            'Use {{name}} in URL paths, query values, headers, or the body. {{guid}} is reserved and generates one UUID per request execution, reused at every occurrence in that request. ' +
            'Use it for unique synthetic inputs such as invoke-{{guid}}@example.com. Fill known body fields with valid synthetic values that satisfy source validation. ' +
            'For later login, bind email and password to /request/body/email and /request/body/password on account creation, rather than generating new credentials. ' +
            'Quoted JSON placeholders preserve the selected JSON type. Optional dependsOn IDs add order-only prerequisites. ' +
            'Definitions contain generators and selectors, never captured runtime values. Editor Send reuses successful outputs; run_http_invocation runs the prerequisite chain by default. ' +
            'Use a concise name of at most 60 characters. Add the request quietly to the session tree without opening a tab. ' +
            'It does not send the request, modify existing invocations, or write any files. ' +
            'Use run_http_invocation with the returned ID or select Send in the editor to execute it. ' +
            'The user must select Save Collection to persist it after VS Code closes.',
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
                context.telemetry.maskEntireErrorMessage = true;
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

function saveHttpInvocation(collection: InvocationCollection, input: z.infer<typeof httpInvocationInputSchema>): HttpInvocation {
    const invocation: HttpInvocation = {
        id: randomUUID(),
        name: input.name.trim(),
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
