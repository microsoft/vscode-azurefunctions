/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { apiUtils } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../../src/extensionVariables';
import type { TestApi } from '../../src/testApi';

let cachedTestApi: TestApi | undefined;

/**
 * Gets the test API from the extension.
 * This API is only available when VSCODE_RUNNING_TESTS is set.
 * This should be called during test setup (e.g., in suiteSetup).
 */
export async function getTestApi(): Promise<TestApi> {
    if (!cachedTestApi) {
        const extension = vscode.extensions.getExtension('ms-azuretools.vscode-azurefunctions');
        if (!extension) {
            throw new Error('Extension not found');
        }

        if (!extension.isActive) {
            await extension.activate();
        }

        const apiProvider: apiUtils.AzureExtensionApiProvider = extension.exports;
        cachedTestApi = apiProvider.getApi<TestApi>('>=99.0.0');

        if (!cachedTestApi) {
            throw new Error('Test API not available. Make sure VSCODE_RUNNING_TESTS is set.');
        }
    }

    return cachedTestApi;
}

/**
 * Gets the cached test API. Throws if not initialized.
 * Use getTestApi() in test setup first, then use this in test code.
 */
export function getCachedTestApi(): TestApi {
    if (!cachedTestApi) {
        throw new Error('Test API not initialized. Call getTestApi() in test setup first.');
    }

    return cachedTestApi;
}

/**
 * Clears the cached test API. Use this if you need to re-fetch the API.
 */
export function clearTestApiCache(): void {
    cachedTestApi = undefined;
}

/**
 * Points this test module's `ext.rgApi` at the activated extension's Azure Resources host API for the
 * current suite, so wizards run by test code register real activities in the Azure activity log.
 */
export function useBundleAzureResourcesHostApi(): void {
    let original: typeof ext.rgApi | undefined;
    suiteSetup(async () => {
        const rgApi = (await getTestApi()).extensionVariables.getRgApi();
        if (!rgApi) {
            throw new Error('The Azure Resources host API is not available.');
        }
        original = ext.rgApi;
        ext.rgApi = rgApi;
    });
    suiteTeardown(() => {
        ext.rgApi = original as typeof ext.rgApi;
    });
}
