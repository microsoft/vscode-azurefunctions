/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { HttpMethods, ServiceClientCredentials, WebResource } from "ms-rest";
import * as path from 'path';
import * as requestP from 'request-promise';
import { appendExtensionUserAgent, ISubscriptionContext } from "vscode-azureextensionui";
import { getWorkspaceSetting } from "../vsCodeConfig/settings";

export namespace requestUtils {
    export type Request = WebResource & requestP.RequestPromiseOptions;

    export async function getDefaultRequestWithTimeout(url: string, credentials?: ServiceClientCredentials, method: HttpMethods = 'GET'): Promise<Request> {
        const request: Request = await getDefaultRequest(url, credentials, method);
        const timeoutSeconds: number | undefined = getWorkspaceSetting('requestTimeout');
        if (timeoutSeconds !== undefined) {
            request.timeout = timeoutSeconds * 1000;
        }
        return request;
    }

    export async function getDefaultRequest(url: string, credentials?: ServiceClientCredentials, method: HttpMethods = 'GET'): Promise<Request> {
        const request: WebResource = new WebResource();
        request.url = url;
        request.method = method;
        request.headers = {
            ['User-Agent']: appendExtensionUserAgent()
        };

        if (credentials) {
            await signRequest(request, credentials);
        }

        return request;
    }

    export async function getDefaultAzureRequest(urlPath: string, context: ISubscriptionContext, method: HttpMethods = 'GET'): Promise<Request> {
        let baseUrl: string = context.environment.resourceManagerEndpointUrl;
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }

        if (!urlPath.startsWith('/')) {
            urlPath = `/${urlPath}`;
        }

        return getDefaultRequest(baseUrl + urlPath, context.credentials, method);
    }

    export async function sendRequest(request: Request): Promise<string> {
        return await <Thenable<string>>requestP(request).promise();
    }

    export async function signRequest(request: Request, cred: ServiceClientCredentials): Promise<void> {
        await new Promise((resolve, reject): void => {
            cred.signRequest(request, (err: Error | undefined) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    export async function downloadFile(url: string, filePath: string): Promise<void> {
        const request: Request = await getDefaultRequestWithTimeout(url);
        await fse.ensureDir(path.dirname(filePath));
        await new Promise(async (resolve, reject): Promise<void> => {
            requestP(request, err => {
                if (err) {
                    reject(err);
                }
            }).pipe(fse.createWriteStream(filePath).on('finish', resolve).on('error', reject));
        });
    }
}
