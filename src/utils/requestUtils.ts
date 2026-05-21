/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ServiceClient } from "@azure/core-client";
import { createPipelineRequest, type PipelinePolicy } from "@azure/core-rest-pipeline";
import { createGenericClient, sendRequestWithTimeout, type AzExtPipelineResponse, type AzExtRequestPrepareOptions } from '@microsoft/vscode-azext-azureutils';
import { AzExtFsExtra, parseError, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as fse from 'fs-extra';
import * as path from 'path';
import { URLSearchParams } from "url";
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
    export async function sendRequestWithExtTimeout(context: IActionContext, options: AzExtRequestPrepareOptions): Promise<AzExtPipelineResponse> {
        const timeout = getRequestTimeoutMS();

        try {
            const mirrorPolicy = getFeedMirrorPolicy();
            if (mirrorPolicy) {
                // Use our own client so we can inject the mirror policy
                const request = createPipelineRequest({ ...options, timeout });
                const client: ServiceClient = await createGenericClient(context, undefined);
                addFeedMirrorPolicy(client, mirrorPolicy);
                return await client.sendRequest(request);
            }
            return await sendRequestWithTimeout(context, options, timeout, undefined);
        } catch (error) {
            if (isTimeoutError(error)) {
                throw new Error(
                    localize('timeoutFeed', 'Request timed out. Modify setting "{0}.{1}" if you want to extend the timeout.', ext.prefix, timeoutKey),
                    { cause: error }
                );
            } else {
                throw error;
            }
        }
    }

    export function isTimeoutError(error: unknown): boolean {
        return parseError(error).errorType === 'REQUEST_ABORTED_ERROR';
    }

    export async function downloadFile(context: IActionContext, requestOptionsOrUrl: string | AzExtRequestPrepareOptions, filePath: string): Promise<void> {
        await AzExtFsExtra.ensureDir(path.dirname(filePath));
        const request = createPipelineRequest(typeof requestOptionsOrUrl === 'string' ? { method: 'GET', url: requestOptionsOrUrl } : requestOptionsOrUrl);
        request.streamResponseStatusCodes = new Set([Number.POSITIVE_INFINITY]);
        const client: ServiceClient = await createGenericClient(context, undefined);

        const mirrorPolicy = getFeedMirrorPolicy();
        if (mirrorPolicy) {
            addFeedMirrorPolicy(client, mirrorPolicy);
        }

        const response: AzExtPipelineResponse = await client.sendRequest(request);
        const stream: NodeJS.ReadableStream = nonNullProp(response, 'readableStreamBody');
        await new Promise<void>((resolve, reject): void => {
            stream.pipe(fse.createWriteStream(filePath).on('finish', () => resolve()).on('error', reject));
        });
    }

    /**
     * Mimics what the azure sdk does under the covers to create standardized property names
     */
    export function convertToAzureSdkObject(data: {}): {} {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(data)) {
            result[convertPropertyName(key)] = convertPropertyValue(data[key] as string | null | undefined);
        }
        return result;
    }

    export function createRequestUrl(base: string, queryParams: Record<string, string>): string {
        const queryString = new URLSearchParams(queryParams).toString();
        return `${base}?${queryString}`;
    }

    /**
     * Converts property name like "function_app_id" to "functionAppId"
     */
    function convertPropertyName(name: string): string {
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

    /**
     * Adds the feed mirror policy to a ServiceClient, replacing the built-in redirect policy
     * so the mirror policy can strip Authorization on cross-origin redirects.
     */
    function addFeedMirrorPolicy(client: ServiceClient, policy: PipelinePolicy): void {
        client.pipeline.removePolicy({ name: 'redirectPolicy' });
        client.pipeline.addPolicy(policy, { phase: 'Serialize' });
    }

    /**
     * Returns a pipeline policy that rewrites external package URLs to an AzDO feed mirror
     * and manages auth (Bearer for the mirror host, stripped on cross-origin redirect).
     *
     * Env vars:
     * - FEED_BASE_URL – e.g. https://devdiv.pkgs.visualstudio.com/DevDiv/_packaging/azcode
     * - FEED_PAT      – Bearer token (System.AccessToken)
     *
     * Internally assembles:
     * - NuGet v3 flat container: {base}/nuget/v3/flat2/{id}/{ver}/{id}.{ver}.nupkg
     * - PSGallery v2 OData:      {base}/nuget/v2/FindPackagesById()?id='{name}'
     *
     * TODO: Move this to `@microsoft/vscode-azext-azureutils` once validated.
     */
    function getFeedMirrorPolicy(): PipelinePolicy | undefined {
        const feedBaseUrl = process.env.FEED_BASE_URL?.replace(/\/+$/, '');
        const feedPat = process.env.FEED_PAT;

        if (!feedBaseUrl || !feedPat) {
            return undefined;
        }

        let feedHost: string;
        try {
            feedHost = new URL(feedBaseUrl).host;
        } catch {
            return undefined;
        }

        const nugetV2Re = /^https:\/\/www\.nuget\.org\/api\/v2\/package\/([^/]+)\/(.+?)\/?$/;
        // aka.ms/PwshPackageInfo resolves to powershellgallery.com; match both
        const psgalleryPrefixes = ['https://aka.ms/PwshPackageInfo', 'https://www.powershellgallery.com/api/v2/FindPackagesById()'];

        return {
            name: 'feedMirrorPolicy',
            async sendRequest(request, next) {
                let isMirrorRequest = false;

                // NuGet URL rewrite: nuget.org v2 package → mirror v3 flat container
                const nugetMatch = request.url.match(nugetV2Re);
                if (nugetMatch) {
                    const id = nugetMatch[1].toLowerCase();
                    const version = nugetMatch[2];
                    request.url = `${feedBaseUrl}/nuget/v3/flat2/${id}/${version}/${id}.${version}.nupkg`;
                    console.log(`[feed-mirror] NuGet rewrite → ${request.url}`);
                    isMirrorRequest = true;
                }

                // PSGallery URL rewrite: aka.ms/PwshPackageInfo or powershellgallery.com → mirror v2 OData
                if (psgalleryPrefixes.some(p => request.url.startsWith(p))) {
                    // Extract the id parameter from the query string
                    const urlObj = new URL(request.url);
                    const id = urlObj.searchParams.get('id') ?? "'Az'";
                    request.url = `${feedBaseUrl}/nuget/v2/FindPackagesById()?id=${id}`;
                    console.log(`[feed-mirror] PSGallery rewrite → ${request.url}`);
                    // PSGallery mirror doesn't need auth — OData query works via upstream
                }

                // Add Bearer auth only for the feed host
                if (isMirrorRequest) {
                    request.headers.set('Authorization', `Bearer ${feedPat}`);
                }

                let response = await next(request);

                // Follow redirects manually, stripping auth on cross-origin.
                // AzDO returns 303 → blob storage (vsblob.vsassets.io) with a SAS URL.
                // The SAS URL is self-authenticating; forwarding Bearer causes 403.
                const redirectCodes = new Set([301, 302, 303, 307, 308]);
                let redirectCount = 0;
                while (redirectCodes.has(response.status) && redirectCount < 5) {
                    const location = response.headers.get('location');
                    if (!location) {
                        break;
                    }

                    request.url = location;
                    if (response.status === 303) {
                        request.method = 'GET';
                    }

                    // Strip auth when redirected away from the feed host
                    if (new URL(location).host !== feedHost) {
                        request.headers.delete('Authorization');
                        console.log(`[feed-mirror] Redirect to ${new URL(location).host} — stripped auth`);
                    }

                    response = await next(request);
                    redirectCount++;
                }

                return response;
            }
        };
    }
}
