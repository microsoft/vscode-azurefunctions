/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { ConsentGuidance, type CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { isIPv4 } from 'net';
import * as z from 'zod/mini';
import { localize } from '../../../localize';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { type HttpRequestEditors } from '../../../webviews/azureInvoke/extension/HttpRequestEditors';

const inputSchema = z.object({ id: z.string().check(z.minLength(1), z.maxLength(100)) });
const outputSchema = z.object({
    status: z.number(),
    duration: z.number(),
    headers: z.optional(z.array(z.object({ name: z.string(), value: z.string() }))),
    body: z.optional(z.string()),
});
const sharedResponseHeaders = new Set([
    'allow', 'cache-control', 'content-encoding', 'content-language', 'content-length',
    'content-type', 'date', 'etag', 'expires', 'last-modified', 'retry-after', 'server',
]);

export function runHttpInvocationTool(
    provider: AzureInvokeTreeDataProvider,
    editors: HttpRequestEditors,
): CopilotTool<typeof inputSchema, typeof outputSchema> {
    return {
        name: 'run_http_invocation',
        title: localize('azureInvoke.runHttpInvocation', 'Run HTTP invocation'),
        description: 'Send a saved Azure Invoke HTTP invocation by its ID, such as the ID returned by create_http_invocation. ' +
            'Use the saved session snapshot, not unsaved editor changes. This makes a real HTTP request and can modify remote data. ' +
            'Ask for user approval before running. Return HTTP status and duration in milliseconds. ' +
            'Only localhost and literal loopback targets also return the complete response body, up to 5 MB, and selected non-sensitive headers. ' +
            'For all other targets, do not return any response body or headers to AI. The full response is displayed in the invocation editor. ' +
            'Local response bodies may contain sensitive data. Redirects are not followed and requests are not retried.',
        inputSchema,
        outputSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
            consentGuidance: ConsentGuidance.AlwaysRequired,
        },
        execute: async (input, extras) => {
            const result = await callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.runHttpInvocation', async context => {
                context.telemetry.maskEntireErrorMessage = true;
                context.errorHandling.suppressDisplay = true;
                context.errorHandling.rethrow = true;
                if (extras?.signal.aborted) {
                    throw new UserCancelledError('azureInvoke.runHttpInvocation');
                }
                const invocation = provider.getRequest(input.id);
                if (!invocation) {
                    throw new Error(localize('azureInvoke.requestNotFound', 'This invocation is no longer in the collection.'));
                }
                let editor;
                try {
                    editor = editors.open(invocation, true);
                } catch {
                    context.telemetry.properties.failureStage = 'openEditor';
                    throw new Error(localize('azureInvoke.openEditorFailed', 'Could not open the Azure Invoke editor. Try creating the invocation again.'));
                }
                const request = {
                    ...invocation.request,
                    body: invocation.request.method === 'GET' || invocation.request.method === 'HEAD' ? '' : invocation.request.body,
                };
                const response = await editor.sendRequest(context, request, { signal: extras?.signal, saved: true });
                const metadata = { status: response.status, duration: response.duration };
                const hostname = new URL(request.url).hostname;
                const local = hostname === 'localhost' || hostname === 'localhost.' || hostname === '[::1]' ||
                    (isIPv4(hostname) && hostname.startsWith('127.'));
                if (!local) {
                    return metadata;
                }
                return {
                    ...metadata,
                    headers: response.headers.filter(header => sharedResponseHeaders.has(header.name.toLowerCase())),
                    body: response.body,
                };
            });
            // Azure Tools handles cancellation without rethrowing it, even when rethrow is enabled.
            if (!result) {
                throw new UserCancelledError('azureInvoke.runHttpInvocation');
            }
            return result;
        },
    };
}
