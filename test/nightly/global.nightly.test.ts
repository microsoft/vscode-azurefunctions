/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient } from '@azure/arm-appservice';
import { ResourceManagementClient } from '@azure/arm-resources';
import { createTestActionContext, type TestActionContext } from '@microsoft/vscode-azext-dev';
import { AzureAccountTreeItemWithProjects, createAzureClient, ext } from '../../extension.bundle';
import { longRunningTestsEnabled } from '../global.test';

import { createSubscriptionContext, subscriptionExperience, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { type AzureSubscription } from '@microsoft/vscode-azureresources-api';
import * as vscode from 'vscode';

export let testClient: WebSiteManagementClient;
let testContext: TestActionContext;
export let subscriptionContext: ISubscriptionContext;
export const resourceGroupsToDelete: string[] = [];

// Runs before all nightly tests
suiteSetup(async function (this: Mocha.Context): Promise<void> {
    if (longRunningTestsEnabled) {
        this.timeout(2 * 60 * 1000);

        await vscode.commands.executeCommand('azureResourceGroups.logIn');
        ext.azureAccountTreeItem = new AzureAccountTreeItemWithProjects();
        testContext = await createTestActionContext();
        const subscription: AzureSubscription = await subscriptionExperience(testContext, ext.rgApi.appResourceTree);
        subscriptionContext = createSubscriptionContext(subscription);
        console.log(`NIGHTLY TEST: Using subscription "${subscriptionContext.subscriptionDisplayName}"...`);
        console.log(`NIGHTLY TEST: Subscription: ${JSON.stringify(subscription)}`);
        console.log(`NIGHTLY TEST: Subscription context: ${JSON.stringify(subscriptionContext)}`);
        testClient = createAzureClient([testContext, subscriptionContext], WebSiteManagementClient);
    }
});

suiteTeardown(async function (this: Mocha.Context): Promise<void> {
    if (longRunningTestsEnabled) {
        this.timeout(10 * 60 * 1000);

        await deleteResourceGroups();
        ext.azureAccountTreeItem.dispose();
    }
});

async function deleteResourceGroups(): Promise<void> {
    const rgClient: ResourceManagementClient = createAzureClient([testContext, subscriptionContext], ResourceManagementClient);
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
