/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site } from '@azure/arm-appservice';
import { tryGetWebApp } from '@microsoft/vscode-azext-azureappservice';
import { runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import * as assert from 'assert';
import { DialogResponses, createFunctionAppAdvanced, deleteFunctionApp, getRandomHexString } from '../../extension.bundle';
import { cleanTestWorkspace, longRunningTestsEnabled } from '../global.test';
import { getRotatingLocation } from './getRotatingValue';
import { resourceGroupsToDelete, testClient } from './global.nightly.test';

suite('Function App Operations', function (this: Mocha.Suite): void {
    this.timeout(7 * 60 * 1000);

    let appName: string;
    let app2Name: string;
    let rgName: string;
    let saName: string;
    let aiName: string;
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
        location = getRotatingLocation();
    });

    test('Create - Advanced', async () => {
        const testInputs: (string | RegExp)[] = [location, '$(plus) Create new resource group', rgName, 'Tenant Scope', appName, 'Flex Consumption', /\.net/i, '4096', '100', 'Managed identity', '$(plus) Create new storage account', saName, '$(plus) Create new Application Insights resource', aiName, '$(plus) Create new user assigned identity'];
        await runWithTestActionContext('createFunctionAppAdvanced', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await createFunctionAppAdvanced(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        assert.ok(createdApp);
    });

    test('Create - Advanced - Existing RG/SA/AI', async () => {
        const testInputs: (string | RegExp)[] = [location, rgName, 'Tenant Scope', app2Name, 'Flex Consumption', /\.net/i, '4096', '100', 'Managed identity', saName, aiName, '$(plus) Create new user assigned identity'];
        await runWithTestActionContext('createFunctionAppAdvanced', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await createFunctionAppAdvanced(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, rgName, app2Name);
        assert.ok(createdApp);
    });

    test('Delete', async () => {
        await runWithTestActionContext('deleteFunctionApp', async context => {
            await context.ui.runWithInputs([appName, DialogResponses.deleteResponse.title, DialogResponses.yes.title], async () => {
                await deleteFunctionApp(context);
            });
        });
        const site: Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        assert.equal(site, undefined);
    });

    test('Delete - Existing RG/SA/AI', async () => {
        await runWithTestActionContext('deleteFunctionApp', async context => {
            await context.ui.runWithInputs([app2Name, DialogResponses.deleteResponse.title, DialogResponses.yes.title], async () => {
                await deleteFunctionApp(context);
            });
        });
        const site: Site | undefined = await tryGetWebApp(testClient, rgName, app2Name);
        assert.equal(site, undefined);
    });
});
