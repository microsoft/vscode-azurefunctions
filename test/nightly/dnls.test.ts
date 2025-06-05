/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site } from '@azure/arm-appservice';
import { tryGetWebApp } from '@microsoft/vscode-azext-azureappservice';
import { runWithTestActionContext } from '@microsoft/vscode-azext-dev';
import * as assert from 'assert';
import { createFunctionApp, createFunctionAppAdvanced, deleteFunctionApp, DialogResponses, getRandomHexString, nonNullProp } from '../../extension.bundle';
import { cleanTestWorkspace, longRunningTestsEnabled } from '../global.test';
import { resourceGroupsToDelete, testClient } from './global.nightly.test';

suite('Domain Name Label Scopes', function (this: Mocha.Suite): void {
    this.timeout(7 * 60 * 1000);

    let basicAppName: string;
    let rgName: string;
    let saName: string;
    let aiName: string;
    let aspName: string;
    let location: string;

    suiteSetup(async function (this: Mocha.Context): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        // Ensure files/settings from previous tests don't affect this suite
        await cleanTestWorkspace();

        basicAppName = getRandomHexString();
        rgName = getRandomHexString();
        saName = getRandomHexString();
        aiName = getRandomHexString();
        aspName = getRandomHexString();
        location = 'East US'; // Don't randomize locations here because some have very restrictive quotas
        resourceGroupsToDelete.push(rgName, basicAppName);
    });

    test('Create - Basic - Tenant DNLS', async () => {
        const testInputs: (string | RegExp)[] = [location, basicAppName, /\.net/i, 'Managed identity'];
        await runWithTestActionContext('createFunctionAppBasicDnls', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await createFunctionApp(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, basicAppName, basicAppName);
        const domainNameSearch: RegExp = new RegExp(location.replace(/\s+/g, ''), 'i');
        assert.ok(createdApp);
        assert.match(nonNullProp(createdApp, 'defaultHostName'), domainNameSearch);
    });

    test('Create - Advanced - Tenant DNLS + Secrets', async () => {
        const appName: string = getRandomHexString();
        const testInputs: (string | RegExp)[] = [location, '$(plus) Create new resource group', rgName, 'Tenant Scope', appName, 'Flex Consumption', /\.net/i, '4096', '100', 'Secrets', '$(plus) Create new storage account', saName, '$(plus) Create new Application Insights resource', aiName, '$(plus) Create new user assigned identity'];
        await runWithTestActionContext('createFunctionAppAdvanced', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await createFunctionAppAdvanced(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        const domainNameSearch: RegExp = new RegExp(location.replace(/\s+/g, ''), 'i');
        assert.ok(createdApp);
        assert.match(nonNullProp(createdApp, 'defaultHostName'), domainNameSearch);
    });

    test('Create - Advanced - Tenant DNLS + Identity', async () => {
        const appName: string = getRandomHexString();
        const testInputs: (string | RegExp)[] = [location, rgName, 'Tenant Scope', appName, 'App Service Plan', /\.net/i, 'Linux', '$(plus) Create new App Service plan', aspName, 'S1', 'Managed identity', saName, aiName, '$(plus) Create new user assigned identity'];
        await runWithTestActionContext('createFunctionAppAdvanced', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await createFunctionAppAdvanced(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        const domainNameSearch: RegExp = new RegExp(location.replace(/\s+/g, ''), 'i');
        assert.ok(createdApp);
        assert.match(nonNullProp(createdApp, 'defaultHostName'), domainNameSearch);

        // Delete right away to free up quota
        await runWithTestActionContext('deleteFunctionApp', async context => {
            await context.ui.runWithInputs([appName, DialogResponses.deleteResponse.title, DialogResponses.yes.title], async () => {
                await deleteFunctionApp(context);
            });
        });
    });

    test('Create - Advanced - Tenant DNLS + Identity + Flex', async () => {
        const appName: string = getRandomHexString();
        const testInputs: (string | RegExp)[] = [location, rgName, 'Tenant Scope', appName, 'Flex Consumption', /\.net/i, '4096', '100', 'Managed identity', saName, aiName, '$(plus) Create new user assigned identity'];
        await runWithTestActionContext('createFunctionAppAdvanced', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await createFunctionAppAdvanced(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        const domainNameSearch: RegExp = new RegExp(location.replace(/\s+/g, ''), 'i');
        assert.ok(createdApp);
        assert.match(nonNullProp(createdApp, 'defaultHostName'), domainNameSearch);
    });

    test('Create - Advanced - Global DNLS + Secrets', async () => {
        const appName: string = getRandomHexString();
        const testInputs: (string | RegExp)[] = [location, rgName, 'Global', appName, 'Flex Consumption', /\.net/i, '4096', '100', 'Managed identity', saName, aiName, '$(plus) Create new user assigned identity'];
        await runWithTestActionContext('createFunctionAppAdvanced', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await createFunctionAppAdvanced(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        const domainNameSearch: RegExp = new RegExp(location.replace(/\s+/g, ''), 'i');
        assert.ok(createdApp);
        assert.doesNotMatch(nonNullProp(createdApp, 'defaultHostName'), domainNameSearch);
    });

    test('Create - Advanced - Global DNLS + Identity', async () => {
        const appName: string = getRandomHexString();
        const testInputs: (string | RegExp)[] = [location, rgName, 'Global', appName, 'App Service Plan', /\.net/i, 'Linux', '$(plus) Create new App Service plan', aspName, 'S1', 'Managed identity', saName, aiName, '$(plus) Create new user assigned identity'];
        await runWithTestActionContext('createFunctionAppAdvanced', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await createFunctionAppAdvanced(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        const domainNameSearch: RegExp = new RegExp(location.replace(/\s+/g, ''), 'i');
        assert.ok(createdApp);
        assert.doesNotMatch(nonNullProp(createdApp, 'defaultHostName'), domainNameSearch);

        // Delete right away to free up quota
        await runWithTestActionContext('deleteFunctionApp', async context => {
            await context.ui.runWithInputs([appName, DialogResponses.deleteResponse.title, DialogResponses.yes.title], async () => {
                await deleteFunctionApp(context);
            });
        });
    });

    test('Create - Advanced - Global DNLS + Identity + Flex', async () => {
        const appName: string = getRandomHexString();
        const testInputs: (string | RegExp)[] = [location, rgName, 'Global', appName, 'Flex Consumption', /\.net/i, '4096', '100', 'Managed identity', saName, aiName, '$(plus) Create new user assigned identity'];
        await runWithTestActionContext('createFunctionAppAdvanced', async context => {
            await context.ui.runWithInputs(testInputs, async () => {
                await createFunctionAppAdvanced(context);
            });
        });
        const createdApp: Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        const domainNameSearch: RegExp = new RegExp(location.replace(/\s+/g, ''), 'i');
        assert.ok(createdApp);
        assert.doesNotMatch(createdApp.defaultHostName ?? '', domainNameSearch);
    });
});
