/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceManagementClient } from 'azure-arm-resource';
// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { Site } from 'azure-arm-website/lib/models';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as vscode from 'vscode';
import { AzureTreeDataProvider, DialogResponses, TestAzureAccount, TestUserInput } from 'vscode-azureextensionui';
import { ext } from '../src/extensionVariables';
import { localize } from '../src/localize';
import { FunctionAppProvider } from '../src/tree/FunctionAppProvider';
import * as fsUtil from '../src/utils/fs';

// This ensures that this will only run on nightly cron builds
if (process.env.TRAVIS_EVENT_TYPE === 'cron') {
    suite('Create Azure Resources', async function (this: ISuiteCallbackContext): Promise<void> {
        this.timeout(1200 * 1000);
        const resourceName: string = fsUtil.getRandomHexString().toLocaleLowerCase(); // storage accounts cannot contain upper case chars
        const testAccount: TestAzureAccount = new TestAzureAccount();

        suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
            this.timeout(120 * 1000);
            const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions Test');
            ext.outputChannel = outputChannel;
            await testAccount.signIn();
            ext.tree = new AzureTreeDataProvider(new FunctionAppProvider(ext.outputChannel), 'azureFunctions.startTesting', undefined, testAccount);
        });

        suiteTeardown(async () => {
            const client: ResourceManagementClient = getResourceManagementClient(testAccount);
            ext.outputChannel.appendLine(`Deleting resource group "${resourceName}..."`);
            await client.resourceGroups.deleteMethod(resourceName);
            ext.outputChannel.appendLine(`Resource group "${resourceName}" deleted.`);
            ext.tree.dispose();
        });

        const createNewFunctionApp: string = 'Create New Function App';
        test(createNewFunctionApp, async () => {
            const testInputs: string[] = [resourceName, '$(plus) Create new resource group', resourceName, '$(plus) Create new storage account', resourceName, 'West US'];
            ext.ui = new TestUserInput(testInputs);
            await vscode.commands.executeCommand('azureFunctions.createFunctionApp');
            const client: WebSiteManagementClient = getWebsiteManagementClient(testAccount);
            const createdApp: Site = await client.webApps.get(resourceName, resourceName);
            assert.ok(createdApp !== undefined);
        });

        const deleteFunctionApp: string = 'Delete Function App';
        test(deleteFunctionApp, async () => {
            ext.ui = new TestUserInput([resourceName, DialogResponses.deleteResponse.title, DialogResponses.yes.title]);
            await vscode.commands.executeCommand('azureFunctions.deleteFunctionApp');
            const client: WebSiteManagementClient = getWebsiteManagementClient(testAccount);
            const deletedApp: Site | undefined = await client.webApps.get(resourceName, resourceName);
            assert.equal(deletedApp, undefined);
        });
    });
} else {
    const skippingTests: string = localize('skippingTests', 'Skipping Azure tests for a non-cron build');
    // tslint:disable-next-line:no-console
    console.log(skippingTests);
}

function getWebsiteManagementClient(testAccount: TestAzureAccount): WebSiteManagementClient {
    // tslint:disable-next-line:no-non-null-assertion
    return new WebSiteManagementClient(testAccount.getSubscriptionCredentials(), testAccount.getSubscriptionId()!);
}

function getResourceManagementClient(testAccount: TestAzureAccount): ResourceManagementClient {
    // tslint:disable-next-line:no-non-null-assertion
    return new ResourceManagementClient(testAccount.getSubscriptionCredentials(), testAccount.getSubscriptionId()!);
}
