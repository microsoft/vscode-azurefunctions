/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient } from '@azure/arm-appservice';
import { ResourceManagementClient } from '@azure/arm-resources';
import { longRunningTestsEnabled } from '../global.test';

import { createAzureClient } from '@microsoft/vscode-azext-azureutils';
import { createSubscriptionContext, createTestActionContext, subscriptionExperience, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { type AzureSubscription } from '@microsoft/vscode-azureresources-api';
import * as vscode from 'vscode';
import { updateGlobalSetting } from '../../src/vsCodeConfig/settings';
import { getResourceGroupsTestApi } from '../utils/resourceGroupsTestApiAccess';
import { getTestApi } from '../utils/testApiAccess';

export let testClient: WebSiteManagementClient;
export let subscriptionContext: ISubscriptionContext;
export const resourceGroupsToDelete: string[] = [];

// Runs before all nightly tests
suiteSetup(async function (this: Mocha.Context): Promise<void> {
    if (longRunningTestsEnabled) {
        this.timeout(2 * 60 * 1000);

        // Initialize the Functions test API
        await getTestApi();

        // Initialize Azure Resources (Resource Groups) test API
        const rgTestApi = await getResourceGroupsTestApi();

        await vscode.commands.executeCommand('azureResourceGroups.logIn');
        const testContext = await createTestActionContext();
        const subscription: AzureSubscription = await subscriptionExperience(testContext, rgTestApi.compatibility.getAppResourceTree());
        subscriptionContext = createSubscriptionContext(subscription);
        console.log(`NIGHTLY TEST: Using subscription "${subscriptionContext.subscriptionDisplayName}"...`);
        testClient = createAzureClient([testContext, subscriptionContext], WebSiteManagementClient);

        // Disable EOL warnings during nightly tests to prevent date-dependent prompts
        // from interfering with automated test inputs
        await updateGlobalSetting('endOfLifeWarning', false);
    }
});

suiteTeardown(async function (this: Mocha.Context): Promise<void> {
    if (longRunningTestsEnabled) {
        this.timeout(10 * 60 * 1000);

        await updateGlobalSetting('endOfLifeWarning', true);
        await deleteResourceGroups();
    }
});

async function deleteResourceGroups(): Promise<void> {
    const rgClient: ResourceManagementClient = createAzureClient([await createTestActionContext(), subscriptionContext], ResourceManagementClient);
    await Promise.all(resourceGroupsToDelete.map(async resourceGroup => {
        if ((await rgClient.resourceGroups.checkExistence(resourceGroup)).body) {
            console.log(`Started delete of resource group "${resourceGroup}"...`);
            await rgClient.resourceGroups.beginDeleteAndWait(resourceGroup);
            console.log(`Successfully started delete of resource group "${resourceGroup}".`);
        } else {
            // If the test failed, the resource group might not actually exist
            console.log(`Ignoring resource group "${resourceGroup}" because it does not exist.`);
        }
    }));
}
