/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceManagementClient } from 'azure-arm-resource';
import { WebSiteManagementClient, WebSiteManagementModels } from 'azure-arm-website';
import { execSync } from 'child_process';
import * as clipboard from 'clipboardy';
import * as fse from 'fs-extra';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureTreeDataProvider, DialogResponses, ext, FunctionAppProvider, getRandomHexString, ProjectLanguage, ProjectRuntime, TestAzureAccount, TestUserInput } from '../extension.bundle';
import { longRunningTestsEnabled } from './global.test';
import { delay } from './msdelay';
import { runWithFuncSetting } from './runWithSetting';
import { getCSharpValidateOptions, getJavaScriptValidateOptions, validateProject } from './validateProject';

// tslint:disable-next-line:max-func-body-length
suite('Create Azure Resources', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(1200 * 1000);
    const resourceGroupsToDelete: string[] = [];
    const testAccount: TestAzureAccount = new TestAzureAccount();
    let webSiteClient: WebSiteManagementClient;
    const resourceName1: string = getRandomHexString().toLowerCase();
    const resourceName3: string = getRandomHexString().toLowerCase();
    const projectPath: string = path.join('D:', 'testOutput');

    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        this.timeout(120 * 1000);
        await testAccount.signIn();
        ext.tree = new AzureTreeDataProvider(FunctionAppProvider, 'azureFunctions.startTesting', undefined, testAccount);
        webSiteClient = getWebsiteManagementClient(testAccount);
    });

    suiteTeardown(async function (this: IHookCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
        this.timeout(1200 * 1000);
        await clearnewprojectfile(projectPath);
        const client: ResourceManagementClient = getResourceManagementClient(testAccount);
        for (const resourceGroup of resourceGroupsToDelete) {
            if (await client.resourceGroups.checkExistence(resourceGroup)) {
                console.log(`Deleting resource group "${resourceGroup}"...`);
                await client.resourceGroups.deleteMethod(resourceGroup);
                console.log(`Resource group "${resourceGroup}" deleted.`);
            } else {
                // If the test failed, the resource group might not actually exist
                console.log(`Ignoring resource group "${resourceGroup}" because it does not exist.`);
            }
        }
        ext.tree.dispose();
    });

    test('Create windows function app (Basic) and deploy JavaScript project', async () => {
        const functionName: string = 'HttpTrigger';
        resourceGroupsToDelete.push(resourceName1);
        await clearnewprojectfile(projectPath);
        await runWithFuncSetting('projectLanguage', ProjectLanguage.JavaScript, async () => {
            await runWithFuncSetting('advancedCreation', undefined, async () => {
                ext.ui = new TestUserInput([resourceName1]);
                await vscode.commands.executeCommand('azureFunctions.createFunctionApp');
                const createdApp: WebSiteManagementModels.Site = await webSiteClient.webApps.get(resourceName1, resourceName1);
                assert.ok(createdApp);
                await runWithFuncSetting('projectRuntime', ProjectRuntime.v2, async () => {
                    const templateId: string = 'HttpTrigger-JavaScript';
                    const authLevel: string = 'function';
                    await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, ProjectLanguage.JavaScript, ProjectRuntime.v2, false, templateId, functionName, { aUtHLevel: authLevel });
                    await validateProject(projectPath, getJavaScriptValidateOptions(true));
                });
            });
        });

        ext.ui = new TestUserInput([resourceName1, 'Deploy']);
        await vscode.commands.executeCommand('azureFunctions.deploy');
        await delay(5000);
        const getFunction: WebSiteManagementModels.FunctionEnvelopeCollection = await webSiteClient.webApps.listFunctions(resourceName1, resourceName1);
        assert.equal(getFunction[0].name, `${resourceName1}/${functionName}`);

        clipboard.writeSync(typeof (undefined));
        ext.ui = new TestUserInput([resourceName1, functionName]);
        await vscode.commands.executeCommand('azureFunctions.copyFunctionUrl');
        assert.ok(clipboard.readSync() !== 'undefined', `The value of the copy function url should not be ${clipboard.readSync()}`);
        assert.ok(clipboard.readSync().includes(resourceName1));

        const result: string = execSync(`curl ${clipboard.readSync()}"&"name=${resourceName1}`).toString();
        assert.equal(result, `Hello ${resourceName1}`, `The return value should be Hello ${resourceName1}`);
    });

    test('createFunctionApp (Advanced)', async () => {
        const resourceName2: string = getRandomHexString();
        const resourceGroupName: string = getRandomHexString();
        const storageAccountName: string = getRandomHexString().toLowerCase();
        resourceGroupsToDelete.push(resourceGroupName);
        await runWithFuncSetting('advancedCreation', 'true', async () => {
            const testInputs: string[] = [resourceName2, 'Windows', 'Consumption Plan', '.NET', '$(plus) Create new resource group', resourceGroupName, '$(plus) Create new storage account', storageAccountName, 'East US'];
            ext.ui = new TestUserInput(testInputs);
            await vscode.commands.executeCommand('azureFunctions.createFunctionApp');
            const createdApp: WebSiteManagementModels.Site = await webSiteClient.webApps.get(resourceGroupName, resourceName2);
            assert.ok(createdApp, 'Create windows Function App with new rg/sa failed.');
        });
    });

    test('stopFunctionApp', async () => {
        let createdApp: WebSiteManagementModels.Site;
        createdApp = await webSiteClient.webApps.get(resourceName1, resourceName1);
        assert.equal(createdApp.state, 'Running', `Function App state should be 'Running' rather than ${createdApp.state} before stop.`);
        ext.ui = new TestUserInput([resourceName1]);
        await vscode.commands.executeCommand('azureFunctions.stopFunctionApp');
        createdApp = await webSiteClient.webApps.get(resourceName1, resourceName1);
        assert.equal(createdApp.state, 'Stopped', `Function App state should be 'Stopped' rather than ${createdApp.state}.`);
    });

    test('startFunctionApp', async () => {
        let createdApp: WebSiteManagementModels.Site;
        createdApp = await webSiteClient.webApps.get(resourceName1, resourceName1);
        assert.equal(createdApp.state, 'Stopped', `Function App state should be 'Stopped' rather than ${createdApp.state} before start.`);
        ext.ui = new TestUserInput([resourceName1]);
        await vscode.commands.executeCommand('azureFunctions.startFunctionApp');
        createdApp = await webSiteClient.webApps.get(resourceName1, resourceName1);
        assert.equal(createdApp.state, 'Running', `Function App state should be 'Running' rather than ${createdApp.state}.`);
    });

    test('restartFunctionApp', async () => {
        let createdApp: WebSiteManagementModels.Site;
        createdApp = await webSiteClient.webApps.get(resourceName1, resourceName1);
        assert.equal(createdApp.state, 'Running', `Function App state should be 'Running' rather than ${createdApp.state} before restart.`);
        ext.ui = new TestUserInput([resourceName1, resourceName1]);
        await vscode.commands.executeCommand('azureFunctions.restartFunctionApp');
        createdApp = await webSiteClient.webApps.get(resourceName1, resourceName1);
        assert.equal(createdApp.state, 'Running', `Function App state should be 'Running' rather than ${createdApp.state}.`);
    });

    test('deleteFunctionApp', async () => {
        ext.ui = new TestUserInput([resourceName1, DialogResponses.deleteResponse.title, DialogResponses.yes.title]);
        await vscode.commands.executeCommand('azureFunctions.deleteFunctionApp');
        const deletedApp: WebSiteManagementModels.Site | undefined = await webSiteClient.webApps.get(resourceName1, resourceName1);
        assert.ifError(deletedApp);
    });

    test('Deploy CSharp project (windows)', async () => {
        await clearnewprojectfile(projectPath);
        const functionName: string = 'HttpTriggerCSharp';
        resourceGroupsToDelete.push(resourceName3);
        await runWithFuncSetting('projectLanguage', ProjectLanguage.CSharp, async () => {
            await runWithFuncSetting('advancedCreation', undefined, async () => {
                ext.ui = new TestUserInput([resourceName3]);
                await vscode.commands.executeCommand('azureFunctions.createFunctionApp');
                const createdApp: WebSiteManagementModels.Site = await webSiteClient.webApps.get(resourceName3, resourceName3);
                assert.ok(createdApp);
                await runWithFuncSetting('projectRuntime', ProjectRuntime.v2, async () => {
                    const templateId: string = 'Azure.Function.CSharp.HttpTrigger.2.x';
                    const namespace: string = 'Company.Function';
                    const accessrights: string = 'function';
                    await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, ProjectLanguage.CSharp, ProjectRuntime.v2, false, templateId, functionName, { namespace: namespace, AccessRights: accessrights });
                    await validateProject(projectPath, getCSharpValidateOptions('testOutput', 'netcoreapp2.1'));
                });
            });
        });

        ext.ui = new TestUserInput([resourceName3, 'Update remote runtime', 'Deploy']);
        await vscode.commands.executeCommand('azureFunctions.deploy');
        await delay(5000);
        const getFunction: WebSiteManagementModels.FunctionEnvelopeCollection = await webSiteClient.webApps.listFunctions(resourceName3, resourceName3);
        assert.equal(getFunction[0].name, `${resourceName3}/${functionName}`);

        clipboard.writeSync(typeof (undefined));
        ext.ui = new TestUserInput([resourceName3, functionName]);
        await vscode.commands.executeCommand('azureFunctions.copyFunctionUrl');
        assert.notEqual(clipboard.readSync(), 'undefined', `The value of the copy function url should not be "${clipboard.readSync()}"`);
        assert.ok(clipboard.readSync().includes(resourceName3));

        const result: string = execSync(`curl ${clipboard.readSync()}"&"name=${resourceName3}`).toString();
        assert.equal(result, `Hello, ${resourceName3}`, `The return value should be Hello, ${resourceName3}`);
    });

    // https://github.com/Microsoft/vscode-azurefunctions/blob/master/docs/api.md#create-function-app
    test('createFunctionApp API', async () => {
        const resourceGroupName: string = getRandomHexString();
        resourceGroupsToDelete.push(resourceGroupName);
        const appAndStorageName1: string = getRandomHexString().toLowerCase(); // storage accounts cannot contain upper case chars
        await runWithFuncSetting('advancedCreation', undefined, async () => {
            await runWithFuncSetting('projectLanguage', ProjectLanguage.JavaScript, async () => {
                const testInputs1: string[] = [appAndStorageName1];
                ext.ui = new TestUserInput(testInputs1);
                const apiResult1: string = <string>await vscode.commands.executeCommand('azureFunctions.createFunctionApp', testAccount.getSubscriptionId(), resourceGroupName);
                const createdApp1: WebSiteManagementModels.Site = await webSiteClient.webApps.get(resourceGroupName, appAndStorageName1);
                assert.ok(createdApp1, 'Function app with new rg/sa failed.');
                assert.equal(apiResult1, createdApp1.id, 'Function app with new rg/sa failed.');
            });
        });

        // Create another function app, but use the existing resource group and storage account through advanced creation
        await runWithFuncSetting('advancedCreation', 'true', async () => {
            const functionAppName2: string = getRandomHexString();
            const testInputs2: string[] = [functionAppName2, 'Windows', 'Consumption Plan', 'JavaScript', appAndStorageName1];
            ext.ui = new TestUserInput(testInputs2);
            const apiResult2: string = <string>await vscode.commands.executeCommand('azureFunctions.createFunctionApp', testAccount.getSubscriptionId(), resourceGroupName);
            const createdApp2: WebSiteManagementModels.Site = await webSiteClient.webApps.get(resourceGroupName, functionAppName2);
            assert.ok(createdApp2, 'Function app with existing rg/sa failed.');
            assert.equal(apiResult2, createdApp2.id, 'Function app with existing rg/sa failed.');
        });

        // NOTE: We currently don't support 'delete' in our API, so no need to test that
    });
});

function getWebsiteManagementClient(testAccount: TestAzureAccount): WebSiteManagementClient {
    return new WebSiteManagementClient(testAccount.getSubscriptionCredentials(), testAccount.getSubscriptionId());
}

function getResourceManagementClient(testAccount: TestAzureAccount): ResourceManagementClient {
    return new ResourceManagementClient(testAccount.getSubscriptionCredentials(), testAccount.getSubscriptionId());
}

async function clearnewprojectfile(projectpath: string): Promise<void> {
    let files: string[] = [];
    if (fse.existsSync(projectpath)) {
        files = fse.readdirSync(projectpath);
        console.log(`Deleting the folder "${projectpath}"...`);
        files.forEach((file: string) => {
            const curPath: string = path.join(projectpath, file);
            fse.removeSync(curPath);
        });
    }
    console.log(`The folder "${projectpath}" is cleared`);
}
