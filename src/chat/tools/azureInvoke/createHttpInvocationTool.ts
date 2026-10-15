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
import { type HttpRequestEditors } from '../../../webviews/azureInvoke/extension/HttpRequestEditors';
import { httpMethods, isInvocationName } from '../../../webviews/azureInvoke/shared/httpRequest';

const entrySchema = z.object({ name: z.string(), value: z.string() });
const inputSchema = z.object({
    name: z.string().check(
        z.minLength(1),
        z.maxLength(100),
        z.refine(isInvocationName, { error: localize('azureInvoke.invalidName', 'Enter a name of 1 to 100 characters without line breaks.') }),
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
});
const outputSchema = z.object({ id: z.string(), message: z.string() });

export function createHttpInvocationTool(
    provider: AzureInvokeTreeDataProvider,
    editors: HttpRequestEditors,
): CopilotTool<typeof inputSchema, typeof outputSchema> {
    return {
        name: 'create_http_invocation',
        title: localize('azureInvoke.createHttpInvocation', 'Create HTTP invocation'),
        description: 'Create an HTTP request in the Azure Functions extension\'s Azure Invoke view. ' +
            'Provide a name and an HTTP or HTTPS URL. Optionally fill in the method, headers, query parameters, and raw body. ' +
            'The method defaults to GET. Put authentication in headers, not in URL credentials. ' +
            'This adds a new invocation to the in-memory session collection and opens its editor for review. ' +
            'It does not send the request, modify existing invocations, or write any files. ' +
            'Use run_http_invocation with the returned ID or select Send in the editor to execute it. ' +
            'The user must select Save Collection to persist it after VS Code closes.',
        inputSchema,
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
                const invocation = {
                    ...provider.createRequest(),
                    name: input.name.trim(),
                    request: {
                        method: input.method ?? 'GET',
                        url: input.url,
                        headers: input.headers ?? [],
                        query: input.query ?? [],
                        body: input.body ?? '',
                    },
                };
                validateInvocation(invocation);
                try {
                    editors.open(invocation, true);
                } catch {
                    context.telemetry.properties.failureStage = 'openEditor';
                    throw new Error(localize('azureInvoke.openEditorFailed', 'Could not open the Azure Invoke editor. Try creating the invocation again.'));
                }
                provider.saveRequest(invocation);
                return {
                    id: invocation.id,
                    message: localize('azureInvoke.invocationCreated', 'Created the invocation in Azure Invoke and saved it for this session. The request has not been sent.'),
                };
            },
        ), 'createdInvocation'),
    };
}
