/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { createHttpHeaders } from '@azure/core-rest-pipeline';
import { feedMirror } from './feedMirror';
import { nonNullProp } from './nonNull';
import { parseJson } from './parseJson';
import { requestUtils } from './requestUtils';

export namespace feedUtils {
    interface ICachedFeed {
        data: {};
        nextRefreshTime: number;
    }

    const cachedFeeds: Map<string, ICachedFeed> = new Map<string, ICachedFeed>();

    /**
     * Provides some helper logic when getting a json feed:
     * 1. Caches the feed for 10 minutes since these feeds don't change very often and we don't want to make repeated calls to get the same information
     * 2. Sets timeout for getting the feed to 15 seconds since we would rather default to the "backup" logic than wait a long time
     */
    export async function getJsonFeed<T extends {}>(context: IActionContext, url: string): Promise<T> {
        const resolvedUrl = feedMirror.resolveUrl(url);
        const cacheKey = resolvedUrl;
        let cachedFeed: ICachedFeed | undefined = cachedFeeds.get(cacheKey);
        if (!cachedFeed || Date.now() > cachedFeed.nextRefreshTime) {
            const headers = resolvedUrl !== url ? createHttpHeaders(feedMirror.getAuthHeaders()) : undefined;
            const response = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: resolvedUrl, headers });
            // NOTE: r.parsedBody doesn't work because these feeds sometimes return with a BOM char or incorrect content-type
            cachedFeed = { data: parseJson(nonNullProp(response, 'bodyAsText')), nextRefreshTime: Date.now() + 10 * 60 * 1000 };
            cachedFeeds.set(cacheKey, cachedFeed);
        }

        return <T>cachedFeed.data;
    }
}
