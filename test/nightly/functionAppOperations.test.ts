/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { WebSiteManagementModels as Models } from 'azure-arm-website';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as vscode from 'vscode';
import { DialogResponses, getRandomHexString, ProjectLanguage } from '../../extension.bundle';
import { longRunningTestsEnabled, testUserInput } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { getRotatingLocation } from './getRotatingValue';
import { resourceGroupsToDelete, testAccount, testClient } from './global.nightly.test';

// tslint:disable-next-line: max-func-body-length
suite('Function App Operations', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(7 * 60 * 1000);

    let appName: string;
    let app2Name: string;
    let rgName: string;
    let saName: string;
    let aiName: string;

    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        appName = getRandomHexString();
        app2Name = getRandomHexString();
        rgName = getRandomHexString();
        resourceGroupsToDelete.push(rgName);
        saName = getRandomHexString().toLowerCase(); // storage account must have lower case name
        aiName = getRandomHexString();
    });

    test('Create - Advanced', async () => {
        const testInputs: string[] = [appName, 'Windows', 'Consumption Plan', '.NET', '$(plus) Create new resource group', rgName, '$(plus) Create new storage account', saName, '$(plus) Create new Application Insights resource', aiName, getRotatingLocation()];
        await testUserInput.runWithInputs(testInputs, async () => {
            await vscode.commands.executeCommand('azureFunctions.createFunctionAppAdvanced');
        });
        const createdApp: Models.Site = await testClient.webApps.get(rgName, appName);
        assert.ok(createdApp);
    });

    test('Create - Advanced - Existing RG/SA/AI', async () => {
        const testInputs: string[] = [app2Name, 'Windows', 'Consumption Plan', '.NET', rgName, saName, aiName];
        await testUserInput.runWithInputs(testInputs, async () => {
            await vscode.commands.executeCommand('azureFunctions.createFunctionAppAdvanced');
        });
        const createdApp: Models.Site = await testClient.webApps.get(rgName, app2Name);
        assert.ok(createdApp);
    });

    // https://github.com/Microsoft/vscode-azurefunctions/blob/master/docs/api.md#create-function-app
    test('Create - API ', async () => {
        const apiRgName: string = getRandomHexString();
        resourceGroupsToDelete.push(apiRgName);
        const apiAppName: string = getRandomHexString();
        await runWithFuncSetting('projectLanguage', ProjectLanguage.JavaScript, async () => {
            await testUserInput.runWithInputs([apiAppName, getRotatingLocation()], async () => {
                const actualFuncAppId: string = <string>await vscode.commands.executeCommand('azureFunctions.createFunctionApp', testAccount.getSubscriptionContext().subscriptionId, apiRgName);
                const site: Models.Site = await testClient.webApps.get(apiRgName, apiAppName);
                assert.ok(site);
                assert.equal(actualFuncAppId, site.id);
            });
        });
    });

    test('Stop', async () => {
        let site: Models.Site = await testClient.webApps.get(rgName, appName);
        assert.equal(site.state, 'Running');
        await testUserInput.runWithInputs([appName], async () => {
            await vscode.commands.executeCommand('azureFunctions.stopFunctionApp');
        });
        site = await testClient.webApps.get(rgName, appName);
        assert.equal(site.state, 'Stopped');
    });

    test('Start', async () => {
        let site: Models.Site = await testClient.webApps.get(rgName, appName);
        assert.equal(site.state, 'Stopped');
        await testUserInput.runWithInputs([appName], async () => {
            await vscode.commands.executeCommand('azureFunctions.startFunctionApp');
        });
        site = await testClient.webApps.get(rgName, appName);
        assert.equal(site.state, 'Running');
    });

    test('Restart', async () => {
        let site: Models.Site = await testClient.webApps.get(rgName, appName);
        assert.equal(site.state, 'Running');
        await testUserInput.runWithInputs([appName], async () => {
            await vscode.commands.executeCommand('azureFunctions.restartFunctionApp');
        });
        site = await testClient.webApps.get(rgName, appName);
        assert.equal(site.state, 'Running');
    });

    test('Delete', async () => {
        await testUserInput.runWithInputs([appName, DialogResponses.deleteResponse.title], async () => {
            await vscode.commands.executeCommand('azureFunctions.deleteFunctionApp');
        });
        const deletedApp: Models.Site | undefined = await testClient.webApps.get(rgName, appName);
        assert.ifError(deletedApp);
    });

    test('Delete - Last App on Plan', async () => {
        await testUserInput.runWithInputs([app2Name, DialogResponses.deleteResponse.title, DialogResponses.yes.title], async () => {
            await vscode.commands.executeCommand('azureFunctions.deleteFunctionApp');
        });
        const deletedApp: Models.Site | undefined = await testClient.webApps.get(rgName, app2Name);
        assert.ifError(deletedApp);
    });
});
