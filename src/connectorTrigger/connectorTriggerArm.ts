/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { webProvider } from '../constants';
import { requestUtils } from '../utils/requestUtils';

export interface ArmListResult<T> {
    value?: T[];
    nextLink?: string | null;
}

export interface ArmPagingErrors {
    pagingLoop(): Error;
    invalidNextLink(): Error;
    invalidOrigin(): Error;
}

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
        if (!page.nextLink) {
            nextUrl = undefined;
            continue;
        }
        if (typeof page.nextLink !== 'string') {
            throw errors.invalidNextLink();
        }
        let resolved: URL;
        try {
            resolved = new URL(page.nextLink, currentUrl);
        } catch {
            throw errors.invalidNextLink();
        }
        if (resolved.origin !== expectedOrigin) {
            throw errors.invalidOrigin();
        }
        nextUrl = resolved.toString();
    }
    return items;
}

export function getResourceManagerEndpoint(context: ISubscriptionContext): string {
    return context.environment.resourceManagerEndpointUrl.replace(/\/+$/, '');
}

export function normalizeConnectorLocation(value: string): string {
    return value.replace(/\s+/g, '').toLowerCase();
}

export function createManagedApisUrl(context: ISubscriptionContext, location: string): string {
    return requestUtils.createRequestUrl(getManagedApisPath(context, location), { 'api-version': '2016-06-01' });
}

export function createManagedApiUrl(context: ISubscriptionContext, location: string, connectorId: string): string {
    return requestUtils.createRequestUrl(
        `${getManagedApisPath(context, location)}/${encodeURIComponent(connectorId)}`,
        { 'api-version': '2016-06-01' },
    );
}

export function createManagedApiExportUrl(context: ISubscriptionContext, location: string, connectorId: string): string {
    return requestUtils.createRequestUrl(
        `${getManagedApisPath(context, location)}/${encodeURIComponent(connectorId)}`,
        { 'api-version': '2022-09-01-preview', export: 'true' },
    );
}

function getManagedApisPath(context: ISubscriptionContext, location: string): string {
    return `${getResourceManagerEndpoint(context)}/subscriptions/${encodeURIComponent(context.subscriptionId)}` +
        `/providers/${webProvider}/locations/${encodeURIComponent(normalizeConnectorLocation(location))}/managedApis`;
}
