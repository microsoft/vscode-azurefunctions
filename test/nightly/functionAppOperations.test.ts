/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site } from '@azure/arm-appservice';
import { tryGetWebApp } from '@microsoft/vscode-azext-azureappservice';
import { runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import { DialogResponses } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { getRandomHexString } from '../../src/utils/fs';
import { cleanTestWorkspace, longRunningTestsEnabled } from '../global.test';
import { getCachedTestApi } from '../utils/testApiAccess';
import { resourceGroupsToDelete, testClient } from './global.nightly.test';

suite('Function App Operations', function (this: Mocha.Suite): void {
    this.timeout(10 * 60 * 1000);

    let appName: string;
    let app2Name: string;
    let rgName: string;
    let saName: string;
    let aiName: string;
    let miName: string;
    let location: string;

    suiteSetup(async function (this: Mocha.Context): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        // Ensure files/settings from previous tests don't affect this suite
        await cleanTestWorkspace();

        appName = getRandomHexString();
        app2Name = getRandomHexString();
        rgName = getRandomHexString();
        resourceGroupsToDelete.push(rgName);
        saName = getRandomHexString().toLowerCase(); // storage account must have lower case name
        aiName = getRandomHexString();
        miName = getRandomHexString();
        location = 'West US 2';
    });

    test('Create - Advanced', async () => {
        const testInputs: (string | RegExp)[] = [
            location,                                   // Location
            '$(plus) Create new resource group',        // Resource Group
            rgName,                                     // RG name
            /secure.*unique|tenant/i,                   // Domain scope (Tenant)
            appName,                                    // App name
            'Flex Consumption',                         // Hosting plan
            /\.net/i,                                   // Stack
            '4096',                                     // Instance memory
            '100',                                      // Max instances
            'Managed identity',                         // Auth type
            '$(plus) Create new user-assigned identity', // Create new identity
            miName,                                     // Identity name
            '$(plus) Create new storage account',       // Storage account
            saName,                                     // SA name
            '$(plus) Create new Application Insights resource', // App Insights
            aiName,                                     // AI name
        ];
        const testApi = getCachedTestApi();
        await runWithTestActionContext('createFunctionAppAdvanced', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await testApi.commands.createFunctionAppAdvanced(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        assert.ok(createdApp);
    });

    test('Create - Advanced - Existing RG/SA/AI', async () => {
        // Same prompt order as above, but using existing resources
        const testInputs: (string | RegExp)[] = [
            location,                                   // Location
            rgName,                                     // Use existing RG
            /secure.*unique|tenant/i,                   // Domain scope (Tenant)
            app2Name,                                   // App name
            'Flex Consumption',                         // Hosting plan
            /\.net/i,                                   // Stack
            '4096',                                     // Instance memory
            '100',                                      // Max instances
            'Managed identity',                         // Auth type
            '$(plus) Create new user-assigned identity', // Create new identity
            app2Name,                                   // Identity name (reuse app2Name)
            app2Name,                                   // SA name (reuse existing)
            app2Name,                                   // AI name (reuse existing)
        ];
        const testApi = getCachedTestApi();
        await runWithTestActionContext('createFunctionAppAdvanced', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await testApi.commands.createFunctionAppAdvanced(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, rgName, app2Name);
        assert.ok(createdApp);
    });

    test('Delete', async () => {
        const testApi = getCachedTestApi();
        await runWithTestActionContext('deleteFunctionApp', async context => {
            await context.ui.runWithInputs([appName, DialogResponses.deleteResponse.title, DialogResponses.yes.title], async () => {
                await testApi.commands.deleteFunctionApp(context);
            });
        });
        const site: Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        assert.equal(site, undefined);
    });

    test('Delete - Existing RG/SA/AI', async () => {
        const testApi = getCachedTestApi();
        await runWithTestActionContext('deleteFunctionApp', async context => {
            await context.ui.runWithInputs([app2Name, DialogResponses.deleteResponse.title, DialogResponses.yes.title], async () => {
                await testApi.commands.deleteFunctionApp(context);
            });
        });
        const site: Site | undefined = await tryGetWebApp(testClient, rgName, app2Name);
        assert.equal(site, undefined);
    });
});
