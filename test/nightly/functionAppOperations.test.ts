/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels as Models } from '@azure/arm-appservice';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { tryGetWebApp } from 'vscode-azureappservice';
import { DialogResponses, getRandomHexString, ProjectLanguage } from '../../extension.bundle';
import { cleanTestWorkspace, longRunningTestsEnabled, testUserInput } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { getRotatingLocation, getRotatingNodeVersion } from './getRotatingValue';
import { resourceGroupsToDelete, testAccount, testClient } from './global.nightly.test';

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
        const testInputs: (string | RegExp)[] = [appName, /\.net/i, 'Windows', '$(plus) Create new resource group', rgName, location, 'Consumption', '$(plus) Create new storage account', saName, '$(plus) Create new Application Insights resource', aiName];
        await testUserInput.runWithInputs(testInputs, async () => {
            await vscode.commands.executeCommand('azureFunctions.createFunctionAppAdvanced');
        });
        const createdApp: Models.Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        assert.ok(createdApp);
    });

    test('Create - Advanced - Existing RG/SA/AI', async () => {
        const testInputs: (string | RegExp)[] = [app2Name, /\.net/i, 'Windows', rgName, location, 'Consumption', saName, aiName];
        await testUserInput.runWithInputs(testInputs, async () => {
            await vscode.commands.executeCommand('azureFunctions.createFunctionAppAdvanced');
        });
        const createdApp: Models.Site | undefined = await tryGetWebApp(testClient, rgName, app2Name);
        assert.ok(createdApp);
    });

    // https://github.com/Microsoft/vscode-azurefunctions/blob/main/docs/api.md#create-function-app
    test('Create - API (deprecated)', async () => {
        const apiRgName: string = getRandomHexString();
        resourceGroupsToDelete.push(apiRgName);
        const apiAppName: string = getRandomHexString();
        await runWithFuncSetting('projectLanguage', ProjectLanguage.JavaScript, async () => {
            await testUserInput.runWithInputs([apiAppName, getRotatingNodeVersion(), getRotatingLocation()], async () => {
                const actualFuncAppId: string = <string>await vscode.commands.executeCommand('azureFunctions.createFunctionApp', testAccount.getSubscriptionContext().subscriptionId, apiRgName);
                const site: Models.Site | undefined = await tryGetWebApp(testClient, apiRgName, apiAppName);
                assert.ok(site);
                assert.equal(actualFuncAppId, site.id);
            });
        });
    });

    test('Stop', async () => {
        let site: Models.Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        assert.equal(site?.state, 'Running');
        await testUserInput.runWithInputs([appName], async () => {
            await vscode.commands.executeCommand('azureFunctions.stopFunctionApp');
        });
        site = await tryGetWebApp(testClient, rgName, appName);
        assert.equal(site?.state, 'Stopped');
    });

    test('Start', async () => {
        let site: Models.Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        assert.equal(site?.state, 'Stopped');
        await testUserInput.runWithInputs([appName], async () => {
            await vscode.commands.executeCommand('azureFunctions.startFunctionApp');
        });
        site = await tryGetWebApp(testClient, rgName, appName);
        assert.equal(site?.state, 'Running');
    });

    test('Restart', async () => {
        let site: Models.Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        assert.equal(site?.state, 'Running');
        await testUserInput.runWithInputs([appName], async () => {
            await vscode.commands.executeCommand('azureFunctions.restartFunctionApp');
        });
        site = await tryGetWebApp(testClient, rgName, appName);
        assert.equal(site?.state, 'Running');
    });

    test('Delete', async () => {
        await testUserInput.runWithInputs([appName, DialogResponses.deleteResponse.title], async () => {
            await vscode.commands.executeCommand('azureFunctions.deleteFunctionApp');
        });
        const site: Models.Site | undefined = await tryGetWebApp(testClient, rgName, appName);
        assert.equal(site, undefined);
    });

    test('Delete - Last App on Plan', async () => {
        await testUserInput.runWithInputs([app2Name, DialogResponses.deleteResponse.title, DialogResponses.yes.title], async () => {
            await vscode.commands.executeCommand('azureFunctions.deleteFunctionApp');
        });
        const site: Models.Site | undefined = await tryGetWebApp(testClient, rgName, app2Name);
        assert.equal(site, undefined);
    });
});
