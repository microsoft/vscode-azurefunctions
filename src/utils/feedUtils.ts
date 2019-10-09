/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseError } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { requestUtils } from './requestUtils';

export namespace feedUtils {
    interface ICachedFeed {
        data: {};
        nextRefreshTime: {};
    }

    const cachedFeeds: Map<string, ICachedFeed> = new Map<string, ICachedFeed>();

    /**
     * Provides some helper logic when getting a json feed:
     * 1. Caches the feed for 10 minutes since these feeds don't change very often and we don't want to make repeated calls to get the same information
     * 2. Sets timeout for getting the feed to 15 seconds since we would rather default to the "backup" logic than wait a long time
     */
    export async function getJsonFeed<T extends {}>(url: string): Promise<T> {
        let cachedFeed: ICachedFeed | undefined = cachedFeeds.get(url);
        if (!cachedFeed || Date.now() > cachedFeed.nextRefreshTime) {
            const request: requestUtils.Request = await requestUtils.getDefaultRequest(url);
            request.timeout = 15 * 1000;

            let response: string;
            try {
                response = await requestUtils.sendRequest(request);
            } catch (error) {
                if (parseError(error).errorType === 'ETIMEDOUT') {
                    throw new Error(localize('timeoutFeed', 'Timed out retrieving feed "{0}".', url));
                } else {
                    throw error;
                }
            }
            cachedFeed = { data: <{}>JSON.parse(response), nextRefreshTime: Date.now() + 10 * 60 * 1000 };
            cachedFeeds.set(url, cachedFeed);
        }

        return <T>cachedFeed.data;
    }
}
