/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, RequestPrepareOptions, ServiceClient, WebResource } from "@azure/ms-rest-js";
import * as fse from 'fs-extra';
import * as path from 'path';
import { createGenericClient, ISubscriptionContext, parseError } from "vscode-azureextensionui";
import { AzureSession } from '../debug/AzureAccountExtension.api';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getWorkspaceSetting } from "../vsCodeConfig/settings";
import { getSubscriptionFromId } from "./azure";
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

    export async function downloadFile(url: string, filePath: string): Promise<void> {
        await fse.ensureDir(path.dirname(filePath));
        const request: WebResource = new WebResource();
        request.prepare({ method: 'GET', url });
        request.streamResponseBody = true;
        const client: ServiceClient = await createGenericClient();
        const response: HttpOperationResponse = await client.sendRequest(request);
        const stream: NodeJS.ReadableStream = nonNullProp(response, 'readableStreamBody');
        await new Promise(async (resolve, reject): Promise<void> => {
            stream.pipe(fse.createWriteStream(filePath).on('finish', resolve).on('error', reject));
        });
    }

    // tslint:disable-next-line:no-any
    export async function getFunctionAppMasterKey(azureSession: AzureSession, resourceId: string, accessToken: any): Promise<HttpOperationResponse> {
        const subscriptionId: string = getSubscriptionFromId(resourceId, false);
        const subscriptionContext: ISubscriptionContext = {
            credentials: azureSession.credentials2,
            subscriptionDisplayName: '',
            subscriptionId: subscriptionId,
            subscriptionPath: `/subscriptions/${subscriptionId}`,
            tenantId: azureSession.tenantId,
            userId: azureSession.userId,
            environment: azureSession.environment,
        };
        const client: ServiceClient = await createGenericClient(subscriptionContext);
        const request: WebResource = new WebResource();
        request.prepare({
            method: 'POST',
            url: `/${resourceId}/host/default/listkeys?api-version=2018-11-01`,
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return await client.sendRequest(request);
    }

    export async function downloadFunctionAppContent(defaultHostName: string, filePath: string, masterKey: string): Promise<void> {
        await fse.ensureDir(path.dirname(filePath));
        const request: WebResource = new WebResource();
        request.prepare({
            method: 'GET',
            url: `https://${defaultHostName}/admin/functions/download?includeCsproj=true&includeAppSettings=true`,
            headers: { 'x-functions-key': masterKey }
        });
        request.streamResponseBody = true;
        const client: ServiceClient = await createGenericClient();
        const response: HttpOperationResponse = await client.sendRequest(request);
        const stream: NodeJS.ReadableStream = nonNullProp(response, 'readableStreamBody');
        await new Promise(async (resolve, reject): Promise<void> => {
            stream.pipe(fse.createWriteStream(filePath).on('finish', resolve).on('error', reject));
        });
    }
}
