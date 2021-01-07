/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import { HttpOperationResponse, RequestPrepareOptions, ServiceClient, WebResource } from "@azure/ms-rest-js";
import * as fse from 'fs-extra';
import * as path from 'path';
import { createGenericClient, IActionContext, parseError } from "vscode-azureextensionui";
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { SlotTreeItemBase } from "../tree/SlotTreeItemBase";
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
    export async function getFunctionAppMasterKey(resourceId: string, actionContext: IActionContext): Promise<WebSiteManagementModels.HostKeys | undefined> {
        const slotTreeItem: SlotTreeItemBase | undefined = await ext.tree.findTreeItem(resourceId, { ...actionContext, loadAll: true });
        return await slotTreeItem?.client.listHostKeys();
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
