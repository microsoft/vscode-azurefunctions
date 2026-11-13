/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { webProvider } from '../constants';
import { requestUtils } from '../utils/requestUtils';

const managedApiApiVersion = '2016-06-01';
const managedApiExportApiVersion = '2022-09-01-preview';

export interface ArmListResult<T> {
    value?: T[];
    nextLink?: string | null;
}

export interface ArmPagingErrors {
    /** A next link repeats a page that was already read. */
    pagingLoop(): Error;
    /** A next link is not a URL. */
    invalidNextLink(): Error;
    /** A next link leaves the first page's origin. */
    invalidOrigin(): Error;
}

/**
 * Reads every page of an ARM list, starting at `initialUrl`. A relative next link resolves against the current page,
 * and next links must not repeat or leave the first page's origin. `getPage` fetches and validates one page.
 */
export async function listArmPages<T>(
    initialUrl: string,
    getPage: (url: string) => Promise<ArmListResult<T>>,
    errors: ArmPagingErrors,
): Promise<T[]> {
    const expectedOrigin = new URL(initialUrl).origin;
    const items: T[] = [];
    const visited = new Set<string>();
    let nextUrl: string | undefined = initialUrl;
    while (nextUrl) {
        const currentUrl = nextUrl;
        if (visited.has(currentUrl)) {
            throw errors.pagingLoop();
        }
        visited.add(currentUrl);

        const page = await getPage(currentUrl);
        items.push(...page.value ?? []);
        nextUrl = resolveNextLink(page.nextLink, currentUrl, expectedOrigin, errors);
    }
    return items;
}

export function getResourceManagerEndpoint(context: ISubscriptionContext): string {
    return context.environment.resourceManagerEndpointUrl.replace(/\/+$/, '');
}

/** Normalizes a region name such as "East US" to its ARM location, "eastus". */
export function normalizeConnectorLocation(value: string): string {
    return value.replace(/\s+/g, '').toLowerCase();
}

/** Lists the managed APIs (connectors) available in a region. */
export function createManagedApisUrl(context: ISubscriptionContext, location: string): string {
    return requestUtils.createRequestUrl(getManagedApisPath(context, location), { 'api-version': managedApiApiVersion });
}

/** Gets a regional managed API, including its connection parameters. */
export function createManagedApiUrl(context: ISubscriptionContext, location: string, connectorId: string): string {
    return requestUtils.createRequestUrl(
        `${getManagedApisPath(context, location)}/${encodeURIComponent(connectorId)}`,
        { 'api-version': managedApiApiVersion },
    );
}

/** Exports a regional managed API's Swagger definition. */
export function createManagedApiExportUrl(context: ISubscriptionContext, location: string, connectorId: string): string {
    return requestUtils.createRequestUrl(
        `${getManagedApisPath(context, location)}/${encodeURIComponent(connectorId)}`,
        { 'api-version': managedApiExportApiVersion, export: 'true' },
    );
}

function getManagedApisPath(context: ISubscriptionContext, location: string): string {
    return `${getResourceManagerEndpoint(context)}/subscriptions/${encodeURIComponent(context.subscriptionId)}` +
        `/providers/${webProvider}/locations/${encodeURIComponent(normalizeConnectorLocation(location))}/managedApis`;
}

function resolveNextLink(
    nextLink: unknown,
    currentUrl: string,
    expectedOrigin: string,
    errors: ArmPagingErrors,
): string | undefined {
    if (!nextLink) {
        return undefined;
    }
    if (typeof nextLink !== 'string') {
        throw errors.invalidNextLink();
    }

    let resolved: URL;
    try {
        resolved = new URL(nextLink, currentUrl);
    } catch {
        throw errors.invalidNextLink();
    }
    if (resolved.origin !== expectedOrigin) {
        throw errors.invalidOrigin();
    }
    return resolved.toString();
}
