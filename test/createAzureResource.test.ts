/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceManagementClient } from 'azure-arm-resource';
import * as fse from 'fs-extra';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureTreeDataProvider, DialogResponses, IAzureNode, IAzureTreeItem, TestAzureAccount, TestUserInput } from 'vscode-azureextensionui';
import { ext } from '../src/extensionVariables';
import { FunctionAppProvider } from '../src/tree/FunctionAppProvider';
import { FunctionAppTreeItem } from '../src/tree/FunctionAppTreeItem';
import * as fsUtil from '../src/utils/fs';

// This ensures that this will only run on nightly cron builds
if (process.env.TRAVIS_EVENT_TYPE === 'cron') {
    suite('Create Azure Resources', async function (this: ISuiteCallbackContext): Promise<void> {
        this.timeout(1200 * 1000);
        const appName: string = 'msftazurefunctionscti';
        const testFolderPath: string = path.join(os.tmpdir(), `azFunc.createNewProjectTests${fsUtil.getRandomHexString()}`);

        suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
            this.timeout(120 * 1000);
            const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions Test');
            ext.outputChannel = outputChannel;
            const testAccount: TestAzureAccount = new TestAzureAccount();
            await testAccount.getTestSubscription();
            ext.tree = new AzureTreeDataProvider(new FunctionAppProvider(ext.outputChannel), 'azureFunctions.startTesting', undefined, testAccount);
            await fse.ensureDir(testFolderPath);
        });

        suiteTeardown(async () => {
            ext.ui = new TestUserInput([appName]);
            const subscriptionNode: IAzureNode<IAzureTreeItem> = (await ext.tree.getChildren())[0];
            const client: ResourceManagementClient = new ResourceManagementClient(subscriptionNode.credentials, subscriptionNode.subscriptionId);
            ext.outputChannel.appendLine(`Deleting resource group "${appName}..."`);
            await client.resourceGroups.deleteMethod(appName);
            ext.outputChannel.appendLine(`Resource group "${appName}" deleted.`);
            ext.tree.dispose();
            await fse.remove(testFolderPath);

        });

        const createNewFunctionApp: string = 'Create New Function App';
        test(createNewFunctionApp, async () => {
            const testInputs: string[] = [appName, '$(plus) Create new resource group', appName, '$(plus) Create new storage account', appName, 'West US'];
            ext.ui = new TestUserInput(testInputs);
            const subscriptionNode: IAzureNode<IAzureTreeItem> = (await ext.tree.getChildren())[0];
            await vscode.commands.executeCommand('azureFunctions.createFunctionApp', subscriptionNode);
            ext.ui = new TestUserInput([appName]);
            const newNode: IAzureNode<FunctionAppTreeItem> = <IAzureNode<FunctionAppTreeItem>>await ext.tree.showNodePicker(FunctionAppTreeItem.contextValue);
            assert.equal(newNode.treeItem.label, appName);
        });

        const deleteFunctionApp: string = 'Delete Function App';
        test(deleteFunctionApp, async () => {
            ext.ui = new TestUserInput([appName]);
            const newNode: IAzureNode<FunctionAppTreeItem> = <IAzureNode<FunctionAppTreeItem>>await ext.tree.showNodePicker(FunctionAppTreeItem.contextValue);
            ext.ui = new TestUserInput([DialogResponses.deleteResponse.title, DialogResponses.yes.title]);
            await vscode.commands.executeCommand('azureFunctions.deleteFunctionApp', newNode);
            const deletedNode: IAzureNode<IAzureTreeItem> | undefined = await ext.tree.findNode(newNode.id);
            assert.equal(deletedNode, undefined);
        });
    });
}
