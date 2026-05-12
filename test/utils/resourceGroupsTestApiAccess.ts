/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { apiUtils, AzExtTreeDataProvider } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
export interface ResourceGroupsTestApi {
    apiVersion: '99.0.0';
    compatibility: {
        getAppResourceTree(): AzExtTreeDataProvider;
    };
}

let cachedRgTestApi: ResourceGroupsTestApi | undefined;

/**
 * Gets the test API from the Azure Resources (Resource Groups) extension.
 * This API is only available when VSCODE_RUNNING_TESTS is set.
 */
export async function getResourceGroupsTestApi(): Promise<ResourceGroupsTestApi> {
    if (!cachedRgTestApi) {
        const extension = vscode.extensions.getExtension('ms-azuretools.vscode-azureresourcegroups');
        if (!extension) {
            throw new Error('Azure Resources extension not found (ms-azuretools.vscode-azureresourcegroups).');
        }

        if (!extension.isActive) {
            await extension.activate();
        }

        const apiProvider: apiUtils.AzureExtensionApiProvider = extension.exports;
        cachedRgTestApi = apiProvider.getApi<ResourceGroupsTestApi>('>=99.0.0');
        console.log('Fetched Azure Resources test API:', cachedRgTestApi);


        if (!cachedRgTestApi) {
            throw new Error('Azure Resources test API not available. Make sure VSCODE_RUNNING_TESTS is set.');
        }

        await ensureSignedInToAzure();
    }

    return cachedRgTestApi;
}

/**
 * Ensures we have an Azure session for nightly tests
 */
async function ensureSignedInToAzure(): Promise<void> {
    try {
        await vscode.authentication.getSession('microsoft', ['https://management.azure.com/.default'], { createIfNone: true });
    } catch {
        // Best-effort; if auth is not available (e.g., local dev), skip
    }
}

export function clearResourceGroupsTestApiCache(): void {
    cachedRgTestApi = undefined;
}
