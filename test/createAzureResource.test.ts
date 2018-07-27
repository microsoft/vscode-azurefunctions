/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceManagementClient } from 'azure-arm-resource';
import * as fse from 'fs-extra';
import { IncomingMessage } from 'http';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureTreeDataProvider, DialogResponses, IActionContext, IAzureNode, IAzureParentNode, IAzureTreeItem, TestUserInput } from 'vscode-azureextensionui';
import { JavaScriptProjectCreator } from '../src/commands/createNewProject/JavaScriptProjectCreator';
import { ProjectLanguage, ProjectRuntime } from '../src/constants';
import { ext } from '../src/extensionVariables';
import { FunctionAppProvider } from '../src/tree/FunctionAppProvider';
import { FunctionAppTreeItem } from '../src/tree/FunctionAppTreeItem';
import { FunctionsTreeItem } from '../src/tree/FunctionsTreeItem';
import { FunctionTreeItem } from '../src/tree/FunctionTreeItem';
import * as fsUtil from '../src/utils/fs';

// tslint:disable-next-line:max-func-body-length
suite('Create Azure Resources', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(1200 * 1000);
    const testFolderPath: string = path.join(os.tmpdir(), `azFunc.createNewProjectTests${fsUtil.getRandomHexString()}`);
    const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions Test');
    ext.outputChannel = outputChannel;
    ext.tree = new AzureTreeDataProvider(new FunctionAppProvider(ext.outputChannel), 'azureFunctions.startTesting', undefined, true);
    let rootNode: IAzureNode<IAzureTreeItem>[] = await ext.tree.getChildren();
    while (rootNode[0].treeItem.label === 'Waiting for Azure sign-in...') {
        rootNode = await ext.tree.getChildren();
    }
    const appName: string = 'travisCTIApp';
    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        this.timeout(120 * 1000);
        await fse.ensureDir(testFolderPath);
    });

    suiteTeardown(async () => {
        this.timeout(15 * 1000);
        outputChannel.dispose();
        await fse.remove(testFolderPath);

    });

    const createNewFunctionApp: string = 'Create New Function App';
    test(createNewFunctionApp, async () => {
        const testInputs: string[] = ['$(plus) Create New Function App', appName, '$(plus) Create new resource group', appName, '$(plus) Create new storage account', appName, 'West US'];
        ext.ui = new TestUserInput(testInputs);
        await vscode.commands.executeCommand('azureFunctions.createFunctionApp');
    });

    // const deployFunctionApp: string = 'Deploy to New Function App';
    // test(deployFunctionApp, async () => {
    //     // create new project
    //     const projectPath: string = testFolderPath;
    //     await testCreateNewProject(projectPath, ProjectLanguage.JavaScript, false);
    //     // create new function
    //     const httpTrigger: string = 'HTTP trigger';
    //     await jsTester.testCreateFunctionWithFolderPath(
    //         httpTrigger,
    //         `${testFolderPath}`,
    //         undefined // Use default Authorization level
    //     );
    //     // deploy current project to app
    //     testInputs = ['$(plus) Create New Function App', appName, '$(plus) Create new resource group', appName, '$(plus) Create new storage account', appName, 'West US'];
    //     testUi = new TestUserInput(testInputs);
    //     testTree = new AzureTreeDataProvider(new FunctionAppProvider(ext.outputChannel), 'azureFunctions.testCreateFunctionApp', undefined, true);
    //     ext.tree = testTree;
    //     ext.ui = testUi;
    //     testActionContext = <IActionContext>{ properties: {}, measurements: {} };
    //     treeChildren = <IAzureParentNode[]>(await testTree.getChildren());
    //     testSubscriptionNode = treeChildren[0];
    //     await vscode.commands.executeCommand('azureFunctions.deploy', `${projectPath}`);
    //     testInputs = [appName];
    //     // wait for deploy
    //     // get function trigger
    //     const testNodes: IAzureParentNode<IAzureTreeItem>[] = <IAzureParentNode<IAzureTreeItem>[]>(await testSubscriptionNode.getCachedChildren());
    //     let newlyDeployNode: IAzureParentNode<FunctionAppTreeItem>;
    //     testNodes.forEach(async (node: IAzureParentNode<FunctionAppTreeItem>) => {
    //         if (node.treeItem.label === appName) {
    //             newlyDeployNode = node;
    //         } else {
    //             throw new Error();
    //         }
    //     });
    //     const functionsNode: IAzureNode<FunctionsTreeItem> = await newlyDeployNode.pickChildNode(['azFuncFunctions']);
    //     const functionTreeItem: FunctionTreeItem = <FunctionTreeItem>(await functionsNode.treeItem.loadMoreChildren())[0];
    //     if (functionTreeItem) {
    //         const httpTriggerUrl: string = functionTreeItem.triggerUrl;
    //         // try to hit http trigger
    //         const funcJsonOptions: request.OptionsWithUri = {
    //             method: 'GET',
    //             uri: `${httpTriggerUrl}&name=nathan`,
    //             resolveWithFullResponse: true
    //         };
    //         wait(5000);
    //         const response: IncomingMessage = await request(funcJsonOptions).promise();
    //         const assertedResponse: string = '"Hello nathan"';
    //         const assertedStatusCode: number = 200;
    //         assert.equal(response.body, assertedResponse);
    //         assert.equal(response.statusCode, assertedStatusCode);
    //     } else {
    //         throw new Error('Function did not deploy successfully');
    //     }

    // });
});
