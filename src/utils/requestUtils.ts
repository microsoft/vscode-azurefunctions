/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, RequestPrepareOptions, ServiceClient, WebResource } from "@azure/ms-rest-js";
import * as fse from 'fs-extra';
import * as path from 'path';
import { createGenericClient, parseError } from "vscode-azureextensionui";
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getWorkspaceSetting } from "../vsCodeConfig/settings";
import { nonNullProp } from "./nonNull";

export namespace requestUtils {
    const timeoutKey: string = 'requestTimeout';

    export async function sendRequestWithTimeout(options: RequestPrepareOptions): Promise<HttpOperationResponse> {
        let request: WebResource = new WebResource();
        request = request.prepare(options);

        const timeoutSeconds: number | undefined = getWorkspaceSetting(timeoutKey);
        if (timeoutSeconds !== undefined) {
            request.timeout = timeoutSeconds * 1000;
        }

        try {
            const client: ServiceClient = await createGenericClient();
            return await client.sendRequest(request);
        } catch (error) {
            if (parseError(error).errorType === 'REQUEST_ABORTED_ERROR') {
                throw new Error(localize('timeoutFeed', 'Request timed out. Modify setting "{0}.{1}" if you want to extend the timeout.', ext.prefix, timeoutKey));
            } else {
                throw error;
            }
        }
    }

    export async function downloadFile(requestOptionsOrUrl: string | RequestPrepareOptions, filePath: string): Promise<void> {
        await fse.ensureDir(path.dirname(filePath));
        const request: WebResource = new WebResource();
        request.prepare(typeof requestOptionsOrUrl === 'string' ? { method: 'GET', url: requestOptionsOrUrl } : requestOptionsOrUrl);
        request.streamResponseBody = true;
        const client: ServiceClient = await createGenericClient();
        const response: HttpOperationResponse = await client.sendRequest(request);
        const stream: NodeJS.ReadableStream = nonNullProp(response, 'readableStreamBody');
        await new Promise(async (resolve, reject): Promise<void> => {
            stream.pipe(fse.createWriteStream(filePath).on('finish', resolve).on('error', reject));
        });
    }
}
