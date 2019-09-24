/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpMethods, ServiceClientCredentials, WebResource } from "ms-rest";
import * as requestP from 'request-promise';
import { appendExtensionUserAgent, ISubscriptionContext } from "vscode-azureextensionui";

export namespace requestUtils {
    export type Request = WebResource & requestP.RequestPromiseOptions;

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

    export async function sendRequest<T>(request: Request): Promise<T> {
        return await <Thenable<T>>requestP(request).promise();
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
}
