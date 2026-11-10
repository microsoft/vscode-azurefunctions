/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../localize';
import { validateCollectionInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { createAzuriteBlobServiceClient } from '../../../utils/azureClients';
import { type BlobInvocation, type BlobUploadResult } from '../shared/blobInvocation';

export class BlobUploadAuthorizationError extends Error {}

export async function uploadBlob(context: IActionContext, invocation: BlobInvocation, signal: AbortSignal, authorize: () => Promise<void> = () => Promise.resolve()): Promise<BlobUploadResult> {
    validateCollectionInvocation(invocation);
    context.valuesToMask.push(invocation.request.content, invocation.request.target.url, invocation.request.container, invocation.request.blobName);
    context.telemetry.maskEntireErrorMessage = true;
    const request = invocation.request;
    const bytes = Buffer.from(request.content, request.encoding);
    const service = await createAzuriteBlobServiceClient(request.target.url);
    const container = service.getContainerClient(request.container);
    const blob = container.getBlockBlobClient(request.blobName);
    const start = Date.now();
    const checkAuthorization = async (): Promise<void> => {
        if (signal.aborted) {
            throw new UserCancelledError('azureInvoke.uploadBlob');
        }
        await authorize();
    };
    try {
        await checkAuthorization();
        await container.createIfNotExists({ abortSignal: signal });
        await checkAuthorization();
        const result = await blob.uploadData(bytes, {
            abortSignal: signal,
            blobHTTPHeaders: { blobContentType: request.contentType },
        });
        return {
            status: 'uploaded', duration: Date.now() - start, bytes: bytes.length,
            etag: result.etag, lastModified: result.lastModified?.toISOString(), functionExecution: 'notObserved',
        };
    } catch (error) {
        if (signal.aborted || isUserCancelledError(error)) {
            throw new UserCancelledError('azureInvoke.uploadBlob');
        }
        if (error instanceof BlobUploadAuthorizationError) {
            throw error;
        }
        // eslint-disable-next-line preserve-caught-error -- Do not expose SDK diagnostics containing private request data.
        throw new Error(localize('azureInvoke.blobUploadError', 'The upload could not be confirmed. Check that Azurite is running at the configured URL. Storage may have changed; inspect it before retrying.'));
    }
}
