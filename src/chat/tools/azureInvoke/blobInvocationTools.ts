/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, nonNullValue, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { ConsentGuidance, type CopilotTool } from '@microsoft/vscode-inproc-mcp';
import * as z from 'zod/mini';
import { localize } from '../../../localize';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { type BlobInvocationEditors } from '../../../webviews/azureInvoke/extension/BlobInvocationEditors';
import { isBlobInvocation } from '../../../webviews/azureInvoke/shared/blobInvocation';

const idSchema = z.string().check(z.minLength(1), z.maxLength(100));
const listInputSchema = z.void();
const listOutputSchema = z.object({
    invocations: z.array(z.object({
        id: z.string(), name: z.string(), manualOnly: z.literal(true),
        container: z.string(), blobName: z.string(),
    })),
});
const uploadInputSchema = z.object({ id: idSchema });
const uploadOutputSchema = z.object({
    status: z.literal('uploaded'), duration: z.number(), bytes: z.number(),
    etag: z.optional(z.string()), lastModified: z.optional(z.string()), functionExecution: z.literal('notObserved'),
});

export function listBlobInvocationsTool(provider: AzureInvokeTreeDataProvider): CopilotTool<typeof listInputSchema, typeof listOutputSchema> {
    return {
        name: 'list_blob_invocations',
        title: localize('azureInvoke.listBlobInvocations', 'Azure Invoke: List manual Blob invocations'),
        description: 'List saved, manual-only Blob upload fixtures and target metadata without content or credentials. ' +
            'These are not HTTP tests. Never include them when the user asks to run tests or a collection. ' +
            'Upload only when the user explicitly requests a Blob invocation, using upload_blob_invocation with approval. ' +
            'The application and Azurite must already be running. An upload cannot establish function execution or business success.',
        inputSchema: listInputSchema, outputSchema: listOutputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: async (_input, extras) => nonNullValue(await callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.listBlobInvocations', context => {
            context.telemetry.maskEntireErrorMessage = true;
            context.errorHandling.suppressDisplay = true;
            context.errorHandling.rethrow = true;
            if (extras?.signal.aborted) {
                throw new UserCancelledError('azureInvoke.listBlobInvocations');
            }
            return {
                invocations: provider.getInvocations().filter(isBlobInvocation).map(invocation => ({
                    id: invocation.id, name: invocation.name, manualOnly: true as const,
                    container: invocation.request.container, blobName: invocation.request.blobName,
                })),
            };
        }), 'blobInvocations'),
    };
}

export function uploadBlobInvocationTool(editors: BlobInvocationEditors): CopilotTool<typeof uploadInputSchema, typeof uploadOutputSchema> {
    return {
        name: 'upload_blob_invocation',
        title: localize('azureInvoke.uploadBlobInvocation', 'Azure Invoke: Upload manual Blob fixture'),
        description: 'Upload one explicitly requested, saved Blob fixture to local Azurite. Never call this for a generic run-tests or run-collection request. ' +
            'This writes real storage and can trigger a function. The client handles normal tool approval. Creates the container if needed and overwrites any existing blob with the same name without another confirmation. ' +
            'Briefly explain overwrite behavior and any trigger-binding mismatch, then call this tool without asking whether to proceed or changing the authorized target. ' +
            'Do not control debugger execution or inspect variables. The user inspects and resumes execution. ' +
            'Returns only upload metadata, never fixture contents. Uploaded does not mean the function ran or succeeded. ' +
            'Cancellation does not undo storage changes. No automatic upload retry, dependency execution, result polling, or state reset.',
        inputSchema: uploadInputSchema, outputSchema: uploadOutputSchema,
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, consentGuidance: ConsentGuidance.AlwaysRequired },
        execute: async (input, extras) => {
            const result = await callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.uploadBlobInvocation', async context => {
                context.telemetry.maskEntireErrorMessage = true;
                context.errorHandling.suppressDisplay = true;
                context.errorHandling.rethrow = true;
                if (extras?.signal.aborted) {
                    throw new UserCancelledError('azureInvoke.uploadBlobInvocation');
                }
                return await editors.uploadSaved(context, input.id, extras?.signal);
            });
            if (!result) {
                throw new UserCancelledError('azureInvoke.uploadBlobInvocation');
            }
            return result;
        },
    };
}
