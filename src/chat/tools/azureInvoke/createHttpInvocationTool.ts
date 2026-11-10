/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, nonNullValue, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { type CopilotTool } from '@microsoft/vscode-inproc-mcp';
import * as z from 'zod/mini';
import { localize } from '../../../localize';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { validateInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { httpMethods, isInvocationName, isResponseBindingName, isResponsePointer, type HttpInvocation } from '../../../webviews/azureInvoke/shared/httpRequest';

const entrySchema = z.object({ name: z.string(), value: z.string(), enabled: z.optional(z.boolean()) });
export const httpInvocationInputSchema = z.object({
    name: z.string().check(
        z.minLength(1),
        z.maxLength(60),
        z.refine(isInvocationName, { error: localize('azureInvoke.invalidAiName', 'Enter a short name of 1 to 60 characters without line breaks.') }),
    ),
    url: z.url({ protocol: /^https?$/ }).check(z.refine(value => {
        if (!URL.canParse(value)) {
            return false;
        }
        const url = new URL(value);
        return !url.username && !url.password;
    }, { error: localize('azureInvoke.invalidProtocol', 'Use an HTTP or HTTPS URL without embedded credentials. Add authentication in Headers.') })),
    method: z.optional(z.enum(httpMethods)),
    headers: z.optional(z.array(entrySchema).check(z.maxLength(100))),
    query: z.optional(z.array(entrySchema).check(z.maxLength(100))),
    body: z.optional(z.string().check(z.maxLength(5 * 1024 * 1024))),
    dependsOn: z.optional(z.array(z.string().check(z.minLength(1), z.maxLength(100))).check(z.maxLength(100))),
    bindings: z.optional(z.array(z.object({
        name: z.string().check(z.refine(isResponseBindingName)),
        sourceId: z.string().check(z.minLength(1), z.maxLength(100)),
        pointer: z.string().check(z.refine(isResponsePointer)),
    })).check(z.maxLength(100))),
});
const outputSchema = z.object({ id: z.string(), message: z.string() });

export function saveHttpInvocation(provider: AzureInvokeTreeDataProvider, input: z.infer<typeof httpInvocationInputSchema>, id?: string) {
    const existing = id ? provider.getRequest(id) : undefined;
    const invocation: HttpInvocation = {
        id: id ?? provider.createRequest().id,
        name: input.name.trim(),
        ...(existing?.group === undefined ? {} : { group: existing.group }),
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
    validateInvocation(invocation);
    provider.saveRequest(invocation);
    return invocation;
}

export function createHttpInvocationTool(provider: AzureInvokeTreeDataProvider): CopilotTool<typeof httpInvocationInputSchema, typeof outputSchema> {
    return {
        name: 'create_http_invocation',
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
            'To author an entire test collection, use propose_invocation_collection first so the user can select cases and add comments. ' +
            'It does not send the request, modify existing invocations, or write any files. ' +
            'Use run_http_invocation with the returned ID or select Send in the editor to execute it. ' +
            'The user must select Save Collection to persist it after VS Code closes.',
        inputSchema: httpInvocationInputSchema,
        outputSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
        },
        execute: async (input, extras) => nonNullValue(await callWithTelemetryAndErrorHandling(
            'azureFunctions.azureInvoke.createHttpInvocation',
            context => {
                context.telemetry.maskEntireErrorMessage = true;
                context.errorHandling.suppressDisplay = true;
                context.errorHandling.rethrow = true;
                if (extras?.signal.aborted) {
                    throw new UserCancelledError('azureInvoke.createHttpInvocation');
                }
                const invocation = saveHttpInvocation(provider, input);
                return {
                    id: invocation.id,
                    message: localize('azureInvoke.invocationCreated', 'Created the invocation in Azure Invoke and saved it for this session. The request has not been sent.'),
                };
            },
        ), 'createdInvocation'),
    };
}
