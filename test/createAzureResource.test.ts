/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceManagementClient } from 'azure-arm-resource';
import { WebSiteManagementClient, WebSiteManagementModels } from 'azure-arm-website';
import { execSync } from 'child_process';
import * as fse from 'fs-extra';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzExtTreeDataProvider, AzureAccountTreeItemWithProjects, delay, DialogResponses, ext, FunctionTreeItem, getRandomHexString, IActionContext, ProjectLanguage, ProjectRuntime, TestAzureAccount, TestUserInput } from '../extension.bundle';
import { longRunningTestsEnabled } from './global.test';
import { runWithFuncSetting } from './runWithSetting';
import { getCSharpValidateOptions, getJavaScriptValidateOptions, validateProject } from './validateProject';

// tslint:disable-next-line:max-func-body-length
suite('Create Azure Resources', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(1200 * 1000);
    const resourceGroupsToDelete: string[] = [];
    const testAccount: TestAzureAccount = new TestAzureAccount();
    let webSiteClient: WebSiteManagementClient;
    const resourceName1: string = getRandomHexString().toLowerCase();
    // Get the *.code-workspace workspace file path
    const projectPath: string = vscode.workspace.rootPath || os.tmpdir();
    // tslint:disable-next-line: prefer-const
    let context: IActionContext | undefined;

    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }

        this.timeout(120 * 1000);
        await testAccount.signIn();
        ext.azureAccountTreeItem = new AzureAccountTreeItemWithProjects(testAccount);
        ext.tree = new AzExtTreeDataProvider(ext.azureAccountTreeItem, 'azureFunctions.loadMore');
        webSiteClient = getWebsiteManagementClient(testAccount);
    });

    suiteTeardown(async function (this: IHookCallbackContext): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
        this.timeout(1200 * 1000);
        await clearProjectFile(projectPath);
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
        ext.azureAccountTreeItem.dispose();
    });

    test('Create windows function app (Basic) and deploy JavaScript project', async () => {
        const functionName: string = 'HttpTrigger';
        resourceGroupsToDelete.push(resourceName1);
        await clearProjectFile(projectPath);
        await runWithFuncSetting('projectLanguage', ProjectLanguage.JavaScript, async () => {
            await runWithFuncSetting('advancedCreation', undefined, async () => {
                ext.ui = new TestUserInput([resourceName1]);
                await vscode.commands.executeCommand('azureFunctions.createFunctionApp');
                const createdApp: WebSiteManagementModels.Site = await webSiteClient.webApps.get(resourceName1, resourceName1);
                assert.ok(createdApp);
                await runWithFuncSetting('projectRuntime', ProjectRuntime.v2, async () => {
                    const templateId: string = 'HttpTrigger-JavaScript';
                    const authLevel: string = 'function';
                    await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, ProjectLanguage.JavaScript, ProjectRuntime.v2, false, templateId, functionName, { AuthLevel: authLevel });
                    await validateProject(projectPath, getJavaScriptValidateOptions(true));
                });
            });
        });

        ext.ui = new TestUserInput([resourceName1, 'Deploy']);
        await vscode.commands.executeCommand('azureFunctions.deploy');
        await delay(500);

        // Verify the deployment result through triggerUrl
        const getFunction: WebSiteManagementModels.FunctionEnvelopeCollection = await webSiteClient.webApps.listFunctions(resourceName1, resourceName1);
        assert.equal(getFunction[0].name, `${resourceName1}/${functionName}`);
        const fullId: string = <string>(getFunction[0].id);
        const triggerUrl: string | undefined = (<FunctionTreeItem>await ext.tree.findTreeItem(fullId, <IActionContext>context)).triggerUrl;
        const result: string = execSync(`curl ${triggerUrl}"&"name=${resourceName1}`).toString();
        assert.equal(result, `Hello ${resourceName1}`, `The result should be "Hello ${resourceName1}" rather than ${result} and the triggerUrl is ${triggerUrl}`);
    });

    test('Deploy CSharp project (windows)', async () => {
        const resourceName2: string = getRandomHexString().toLowerCase();
        await clearProjectFile(projectPath);
        const functionName: string = 'HttpTriggerCSharp';
        resourceGroupsToDelete.push(resourceName2);
        await runWithFuncSetting('projectLanguage', ProjectLanguage.CSharp, async () => {
            await runWithFuncSetting('advancedCreation', undefined, async () => {
                ext.ui = new TestUserInput([resourceName2]);
                await vscode.commands.executeCommand('azureFunctions.createFunctionApp');
                const createdApp: WebSiteManagementModels.Site = await webSiteClient.webApps.get(resourceName2, resourceName2);
                assert.ok(createdApp);
                await runWithFuncSetting('projectRuntime', ProjectRuntime.v2, async () => {
                    const templateId: string = 'Azure.Function.CSharp.HttpTrigger.2.x';
                    const nameSpace: string = 'Company.Function';
                    const accessRights: string = 'function';
                    await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, ProjectLanguage.CSharp, ProjectRuntime.v2, false, templateId, functionName, { namespace: nameSpace, AccessRights: accessRights });
                    await validateProject(projectPath, getCSharpValidateOptions('testOutput', 'netcoreapp2.1'));
                });
            });
        });

        ext.ui = new TestUserInput([resourceName2, 'Update remote runtime', 'Deploy']);
        await vscode.commands.executeCommand('azureFunctions.deploy');
        await delay(500);

        // Verify the deployment result through triggerUrl
        const getFunction: WebSiteManagementModels.FunctionEnvelopeCollection = await webSiteClient.webApps.listFunctions(resourceName2, resourceName2);
        assert.equal(getFunction[0].name, `${resourceName2}/${functionName}`);
        const fullId: string = <string>(getFunction[0].id);
        const triggerUrl: string | undefined = (<FunctionTreeItem>await ext.tree.findTreeItem(fullId, <IActionContext>context)).triggerUrl;
        const result: string = execSync(`curl ${triggerUrl}"&"name=${resourceName2}`).toString();
        assert.equal(result, `Hello, ${resourceName2}`, `The result should be "Hello, ${resourceName2}" rather than ${result} and the triggerUrl is ${triggerUrl}`);
    });

    test('createFunctionApp (Advanced)', async () => {
        const resourceName3: string = getRandomHexString();
        const resourceGroupName: string = getRandomHexString();
        const storageAccountName: string = getRandomHexString().toLowerCase();
        resourceGroupsToDelete.push(resourceGroupName);
        await runWithFuncSetting('advancedCreation', 'true', async () => {
            const testInputs: string[] = [resourceName3, 'Windows', 'Consumption Plan', '.NET', '$(plus) Create new resource group', resourceGroupName, '$(plus) Create new storage account', storageAccountName, 'East US'];
            ext.ui = new TestUserInput(testInputs);
            await vscode.commands.executeCommand('azureFunctions.createFunctionApp');
            const createdApp: WebSiteManagementModels.Site = await webSiteClient.webApps.get(resourceGroupName, resourceName3);
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

async function clearProjectFile(projectPath: string): Promise<void> {
    let files: string[] = [];
    if (fse.existsSync(projectPath)) {
        files = fse.readdirSync(projectPath);
        console.log(`Deleting all files from "${projectPath}"...`);
        files.forEach((file: string) => {
            const curPath: string = path.join(projectPath, file);
            fse.removeSync(curPath);
        });
    }
    console.log(`The folder "${projectPath}" is cleared`);
}
