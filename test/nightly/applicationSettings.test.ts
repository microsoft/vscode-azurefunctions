/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { WebSiteManagementModels as Models } from 'azure-arm-website';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as vscode from 'vscode';
import { DialogResponses, getRandomHexString } from '../../extension.bundle';
import { longRunningTestsEnabled, testUserInput } from '../global.test';
import { resourceGroupsToDelete, testClient } from './global.nightly.test';

suite('Application settings', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(7 * 60 * 1000);

    let resourceName: string;
    let rename: string;
    let edit: string;
    const appSetting: { key: string; value: string } = {
        key: 'FUNCTIONS_EXTENSION_CODE_URL',
        value: 'https://github.com/microsoft/vscode-azurefunctions'
    };

    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        resourceName = getRandomHexString().toLowerCase(); // storage accounts cannot contain upper case chars
        rename = getRandomHexString();
        edit = getRandomHexString();
        resourceGroupsToDelete.push(resourceName);
    });

    test('Add new setting', async () => {
        await testUserInput.runWithInputs([/create new function app/i, resourceName, 'Windows', '.NET', 'East US', appSetting.key, appSetting.value], async () => {
            await vscode.commands.executeCommand('azureFunctions.appSettings.add');
        });
        await validateApplicationSetting(appSetting.key, appSetting.value);
    });

    test('Rename setting', async () => {
        await validateApplicationSetting(appSetting.key, appSetting.value);
        await testUserInput.runWithInputs([resourceName, `${appSetting.key}=Hidden value. Click to view.`, rename], async () => {
            await vscode.commands.executeCommand('azureFunctions.appSettings.rename');
        });
        await validateApplicationSetting(rename, appSetting.value);
    });

    test('Edit setting', async () => {
        await validateApplicationSetting(rename, appSetting.value);
        await testUserInput.runWithInputs([resourceName, `${rename}=Hidden value. Click to view.`, edit], async () => {
            await vscode.commands.executeCommand('azureFunctions.appSettings.edit');
        });
        await validateApplicationSetting(rename, edit);
    });

    test('Delete setting', async () => {
        await validateApplicationSetting(rename, edit);
        await testUserInput.runWithInputs([resourceName, `${rename}=Hidden value. Click to view.`, DialogResponses.deleteResponse.title], async () => {
            await vscode.commands.executeCommand('azureFunctions.appSettings.delete');
        });
        await validateApplicationSetting(rename, undefined);
    });

    async function validateApplicationSetting(key: string, value: string | undefined): Promise<void> {
        let settingValue: string | undefined = '';
        const listAppSettings: Models.StringDictionary = await testClient.webApps.listApplicationSettings(resourceName, resourceName);
        if (listAppSettings.properties) {
            settingValue = listAppSettings.properties[key];
        }
        assert.equal(settingValue, value);
    }
});
