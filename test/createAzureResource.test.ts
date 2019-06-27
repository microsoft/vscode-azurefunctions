/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceManagementClient } from 'azure-arm-resource';
import { WebSiteManagementClient, WebSiteManagementModels } from 'azure-arm-website';
import * as fse from 'fs-extra';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as path from 'path';
import * as request from 'request-promise';
import * as vscode from 'vscode';
import { AzExtTreeDataProvider, AzureAccountTreeItemWithProjects, delay, DialogResponses, ext, getRandomHexString, ProjectLanguage, ProjectRuntime, TestAzureAccount, TestUserInput } from '../extension.bundle';
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
    const projectPath: string = getTestRootFolder();

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
        fse.emptyDirSync(projectPath);
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
        resourceGroupsToDelete.push(resourceName1);
        await runWithFuncSetting('projectLanguage', ProjectLanguage.JavaScript, async () => {
            await runWithFuncSetting('projectRuntime', ProjectRuntime.v2, async () => {
                const functionName: string = 'HttpTrigger';
                const templateId: string = 'HTTP trigger';
                const authLevel: string = 'Function';
                ext.ui = new TestUserInput([projectPath, templateId, functionName, authLevel]);
                await vscode.commands.executeCommand('azureFunctions.createNewProject');
                await validateProject(projectPath, getJavaScriptValidateOptions(true));
                await runWithFuncSetting('advancedCreation', undefined, async () => {
                    ext.ui = new TestUserInput(['$(plus) Create New Function App in Azure', resourceName1]);
                    await vscode.commands.executeCommand('azureFunctions.deploy');
                    await delay(500);
                    // Verify the deployment result through copyFunctionUrl
                    await vscode.env.clipboard.writeText(''); // Clear the clipboard
                    ext.ui = new TestUserInput([resourceName1, functionName]);
                    await vscode.commands.executeCommand('azureFunctions.copyFunctionUrl');
                    const functionUrl: string = await vscode.env.clipboard.readText();
                    const result: string = await getBody(functionUrl, resourceName1);
                    assert.equal(result, `Hello ${resourceName1}`, `The result should be "Hello ${resourceName1}" rather than ${result} and the triggerUrl is ${functionUrl}`);
                });
            });
        });
    });

    test('Deploy CSharp project (windows)', async () => {
        const resourceName2: string = getRandomHexString().toLowerCase();
        fse.emptyDirSync(projectPath);
        resourceGroupsToDelete.push(resourceName2);
        await runWithFuncSetting('projectLanguage', ProjectLanguage.CSharp, async () => {
            await runWithFuncSetting('projectRuntime', ProjectRuntime.v2, async () => {
                const functionName: string = 'HttpTriggerCSharp';
                const templateId: string = 'HttpTrigger';
                const nameSpace: string = 'Company.Function';
                const accessRights: string = 'Function';
                ext.ui = new TestUserInput([projectPath, templateId, functionName, nameSpace, accessRights]);
                await vscode.commands.executeCommand('azureFunctions.createNewProject');
                await validateProject(projectPath, getCSharpValidateOptions('testOutput', 'netcoreapp2.1'));
                await runWithFuncSetting('advancedCreation', undefined, async () => {
                    ext.ui = new TestUserInput(['$(plus) Create New Function App in Azure', resourceName2]);
                    await vscode.commands.executeCommand('azureFunctions.deploy');
                    await delay(500);
                    // Verify the deployment result through copyFunctionUrl
                    await vscode.env.clipboard.writeText(''); // Clear the clipboard
                    ext.ui = new TestUserInput([resourceName2, functionName]);
                    await vscode.commands.executeCommand('azureFunctions.copyFunctionUrl');
                    const functionUrl: string = await vscode.env.clipboard.readText();
                    const result: string = await getBody(functionUrl, resourceName2);
                    assert.equal(result, `Hello, ${resourceName2}`, `The result should be "Hello, ${resourceName2}" rather than ${result} and the triggerUrl is ${functionUrl}`);
                });
            });
        });
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

// The root workspace folder that vscode is opened against for tests
function getTestRootFolder(): string {
    let testRootFolder: string = '';
    const testOutputName: string = 'testOutput';
    if (!testRootFolder) {
        // We're expecting to be opened against the test/test.code-workspace
        // workspace.
        const workspaceFolders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.error("No workspace is open.");
            process.exit(1);
        } else {
            if (workspaceFolders.length > 1) {
                console.error("There are unexpected multiple workspaces open");
                process.exit(1);
            }
            testRootFolder = workspaceFolders[0].uri.fsPath;
            console.log(`testRootFolder: ${testRootFolder}`);
            if (path.basename(testRootFolder) !== testOutputName) {
                console.error("vscode is opened against the wrong folder for tests");
                process.exit(1);
            }
            fse.ensureDirSync(testRootFolder);
            fse.emptyDirSync(testRootFolder);
        }
    }
    return testRootFolder;
}

async function getBody(url: string, name: string): Promise<string> {
    const options: request.OptionsWithUri = {
        method: 'GET',
        uri: url,
        body: {
            name: name
        },
        json: true
    };
    return await <Thenable<string>>request(options).promise();
}
