/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, RequestPrepareOptions, ServiceClient, WebResource } from "@azure/ms-rest-js";
import * as fse from 'fs-extra';
import * as path from 'path';
import { createGenericClient, parseError, sendRequestWithTimeout } from "vscode-azureextensionui";
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getWorkspaceSetting } from "../vsCodeConfig/settings";
import { nonNullProp, nonNullValue } from "./nonNull";

export namespace requestUtils {
    const timeoutKey: string = 'requestTimeout';

    /**
     * Send a request using the extension's user-controlled timeout setting
     */
    export async function sendRequestWithExtTimeout(options: RequestPrepareOptions): Promise<HttpOperationResponse> {
        // Shouldn't be null because the setting has a default value
        const timeout: number = nonNullValue(getWorkspaceSetting<number>(timeoutKey), timeoutKey) * 1000;

        try {
            return await sendRequestWithTimeout(options, timeout);
        } catch (error) {
            if (isTimeoutError(error)) {
                throw new Error(localize('timeoutFeed', 'Request timed out. Modify setting "{0}.{1}" if you want to extend the timeout.', ext.prefix, timeoutKey));
            } else {
                throw error;
            }
        }
    }

    export function isTimeoutError(error: unknown): boolean {
        return parseError(error).errorType === 'REQUEST_ABORTED_ERROR';
    }

    export async function downloadFile(requestOptionsOrUrl: string | RequestPrepareOptions, filePath: string): Promise<void> {
        await fse.ensureDir(path.dirname(filePath));
        const request: WebResource = new WebResource();
        request.prepare(typeof requestOptionsOrUrl === 'string' ? { method: 'GET', url: requestOptionsOrUrl } : requestOptionsOrUrl);
        request.streamResponseBody = true;
        const client: ServiceClient = await createGenericClient();
        const response: HttpOperationResponse = await client.sendRequest(request);
        const stream: NodeJS.ReadableStream = nonNullProp(response, 'readableStreamBody');
        await new Promise((resolve, reject): void => {
            stream.pipe(fse.createWriteStream(filePath).on('finish', resolve).on('error', reject));
        });
    }

    /**
     * Mimics what the azure sdk does under the covers to create standardized property names
     */
    export function convertToAzureSdkObject(data: {}): {} {
        const result = {};
        for (const key of Object.keys(data)) {
            result[convertPropertyName(key)] = convertPropertyValue(data[key]);
        }
        return result;
    }

    /**
     * Converts property name like "function_app_id" to "functionAppId"
     */
    function convertPropertyName(name: string): string {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const match: RegExpMatchArray | null = /_([a-z])/g.exec(name);
            if (match) {
                name = name.replace(match[0], match[1].toUpperCase());
            } else {
                return name;
            }
        }
    }

    /**
     * The azure sdk types all use undefined instead of null, so ensure we align with that
     */
    function convertPropertyValue(value: string | null | undefined): string | undefined {
        return value === null ? undefined : value;
    }
}
