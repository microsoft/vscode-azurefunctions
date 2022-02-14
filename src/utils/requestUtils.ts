/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, RequestPrepareOptions, ServiceClient, WebResource } from "@azure/ms-rest-js";
import { AzExtRequestPrepareOptions, createGenericClient, sendRequestWithTimeout } from '@microsoft/vscode-azext-azureutils';
import { IActionContext, parseError } from "@microsoft/vscode-azext-utils";
import * as fse from 'fs-extra';
import * as path from 'path';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getWorkspaceSetting } from "../vsCodeConfig/settings";
import { nonNullProp, nonNullValue } from "./nonNull";

export namespace requestUtils {
    export const timeoutKey: string = 'requestTimeout';

    export function getRequestTimeoutMS(): number {
        // Shouldn't be null because the setting has a default value
        return nonNullValue(getWorkspaceSetting<number>(timeoutKey), timeoutKey) * 1000;
    }

    /**
     * Send a request using the extension's user-controlled timeout setting
     */
    export async function sendRequestWithExtTimeout(context: IActionContext, options: AzExtRequestPrepareOptions): Promise<HttpOperationResponse> {
        const timeout = getRequestTimeoutMS();

        try {
            return await sendRequestWithTimeout(context, options, timeout, undefined);
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

    export async function downloadFile(context: IActionContext, requestOptionsOrUrl: string | RequestPrepareOptions, filePath: string): Promise<void> {
        await fse.ensureDir(path.dirname(filePath));
        const request: WebResource = new WebResource();
        request.prepare(typeof requestOptionsOrUrl === 'string' ? { method: 'GET', url: requestOptionsOrUrl } : requestOptionsOrUrl);
        request.streamResponseBody = true;
        const client: ServiceClient = await createGenericClient(context, undefined);
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
