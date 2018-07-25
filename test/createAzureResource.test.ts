/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceManagementClient } from 'azure-arm-resource';
import * as fse from 'fs-extra';
import { IncomingMessage } from 'http';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as path from 'path';
import request = require('request-promise');
import { deleteFunction } from 'src/commands/';
import * as vscode from 'vscode';
import { AzureTreeDataProvider, DialogResponses, IActionContext, IAzureNode, IAzureParentNode, IAzureTreeItem, TestUserInput } from 'vscode-azureextensionui';
import { createFunctionApp } from '../src/commands/createFunctionApp';
import { JavaScriptProjectCreator } from '../src/commands/createNewProject/JavaScriptProjectCreator';
import { deploy } from '../src/commands/deploy';
import { ProjectLanguage, ProjectRuntime } from '../src/constants';
import { ext } from '../src/extensionVariables';
import { FunctionAppProvider } from '../src/tree/FunctionAppProvider';
import { FunctionAppTreeItem } from '../src/tree/FunctionAppTreeItem';
import { FunctionsTreeItem } from '../src/tree/FunctionsTreeItem';
import { FunctionTreeItem } from '../src/tree/FunctionTreeItem';
import { testFolderPath } from './constants';
import { FunctionTesterBase } from './createFunction/FunctionTesterBase';
import { testCreateNewProject } from './createNewProject.test';

class JSFunctionTester extends FunctionTesterBase {
    protected _language: ProjectLanguage = ProjectLanguage.JavaScript;
    protected _runtime: ProjectRuntime = JavaScriptProjectCreator.defaultRuntime;

    public async validateFunction(testFolder: string, funcName: string): Promise<void> {
        const functionPath: string = path.join(testFolder, funcName);
        assert.equal(await fse.pathExists(path.join(functionPath, 'index.js')), true, 'index.js does not exist');
        assert.equal(await fse.pathExists(path.join(functionPath, 'function.json')), true, 'function.json does not exist');
    }

    public async testCreateFunction(templateName: string, ...inputs: (string | undefined)[]): Promise<void> {
        if (funcPortalTemplateData) {
            await this.testCreateFunctionInternal(funcPortalTemplateData, this.funcPortalTestFolder, templateName, inputs.slice());
        } else {
            assert.fail('Failed to find templates from functions portal.');
        }

        await this.testCreateFunctionInternal(backupTemplateData, this.backupTestFolder, templateName, inputs.slice());
    }
}

// tslint:disable-next-line:max-func-body-length
suite('Create Azure Resources', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(600 * 1000);
    const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions Test');
    ext.outputChannel = outputChannel;
    let testInputs: string[];
    let testUi: TestUserInput;
    let testTree: AzureTreeDataProvider;
    let testActionContext: IActionContext;
    let treeChildren: IAzureParentNode[];
    let testSubscriptionNode: IAzureParentNode;
    const testNodeIds: string[] = [];
    const jsTester: JSFunctionTester = new JSFunctionTester();
    const appName: string = "finaltestplease7";

    // tslint:disable-next-line:no-any
    async function asyncForEach(array: any[], callback: Function): Promise<void> {
        for (let index: number = 0; index < array.length; index += 1) {
            await callback(array[index], index, array);
        }
    }

    // tslint:disable-next-line:no-function-expression
    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        this.timeout(120 * 1000);
        // testInputs = ['$(plus) Create New Function App', appName, '$(plus) Create new resource group', appName, '$(plus) Create new storage account', appName, 'West US'];
        // testUi = new TestUserInput(testInputs);
        // testTree = new TestAzureTreeDataProvider(new FunctionAppProvider(outputChannel), 'azureFunctions.testCreateFunctionApp', testUi, undefined);
        // ext.ui = testUi;
        // ext.tree = testTree;
        // testActionContext = <IActionContext>{ properties: {}, measurements: {} };
        // treeChildren = <IAzureParentNode[]>(await testTree.getChildren());
        // testSubscriptionNode = treeChildren[0];
        await jsTester.initAsync();
        await fse.ensureDir(testFolderPath);
    });

    suiteTeardown(async () => {
        this.timeout(15 * 1000);
        const testNodes: IAzureNode[] = await testSubscriptionNode.getCachedChildren();
        const resourceManagementClient: ResourceManagementClient = new ResourceManagementClient(testSubscriptionNode.credentials, testSubscriptionNode.subscriptionId);
        const deleteTestsAync: Function = async (): Promise<void> => {
            await asyncForEach(testNodes, (async (node: IAzureNode): Promise<void> => {
                if (node.treeItem.label === appName) {
                    testInputs = [DialogResponses.deleteResponse.title, DialogResponses.yes.title /* for deleting the App Service Plan*/];
                    testUi.reassignInputs(testInputs);
                    await vscode.commands.executeCommand('azureFunctions.deleteFunctionApp', node);
                    await resourceManagementClient.resourceGroups.deleteMethod(node.treeItem.label);
                }
            }));
        };
        await deleteTestsAync();
        await jsTester.dispose();
        outputChannel.dispose();
    });

    const createNewFunctionApp: string = 'Create New Function App';
    /* test(createNewFunctionApp, async () => {
        const testFunctionAppId: string = await createFunctionApp(testActionContext, testTree, testSubscriptionNode);
        testNodeIds.push(testFunctionAppId);
        const nodes: IAzureNode[] = await testSubscriptionNode.getCachedChildren();
        let newNode: IAzureNode;
        nodes.forEach(async (node: IAzureNode) => {
            if (node.id === testFunctionAppId) {
                newNode = node;
            } else {
                throw new Error();
            }
        });
        assert.equal(testFunctionAppId, newNode.id);
    });
    */

    function wait(ms) {
        const start = new Date().getTime();
        let end = start;
        while (end < start + ms) {
            end = new Date().getTime();
        }
    }

    const deployFunctionApp: string = 'Deploy to New Function App';
    test(deployFunctionApp, async () => {
        // create new project
        const projectPath: string = testFolderPath;
        await testCreateNewProject(projectPath, ProjectLanguage.JavaScript, false);
        // create new function
        const httpTrigger: string = 'HTTP trigger';
        await jsTester.testCreateFunctionWithFolderPath(
            httpTrigger,
            `${testFolderPath}`,
            undefined // Use default Authorization level
        );
        // deploy current project to app
        testInputs = ['$(plus) Create New Function App', appName, '$(plus) Create new resource group', appName, '$(plus) Create new storage account', appName, 'West US'];
        testUi = new TestUserInput(testInputs);
        testTree = new AzureTreeDataProvider(new FunctionAppProvider(ext.outputChannel), 'azureFunctions.testCreateFunctionApp', undefined, true);
        ext.tree = testTree;
        ext.ui = testUi;
        testActionContext = <IActionContext>{ properties: {}, measurements: {} };
        treeChildren = <IAzureParentNode[]>(await testTree.getChildren());
        testSubscriptionNode = treeChildren[0];
        await vscode.commands.executeCommand('azureFunctions.deploy', `${projectPath}`);
        testInputs = [appName];
        // wait for deploy
        // get function trigger
        const testNodes: IAzureParentNode<IAzureTreeItem>[] = <IAzureParentNode<IAzureTreeItem>[]>(await testSubscriptionNode.getCachedChildren());
        let newlyDeployNode: IAzureParentNode<FunctionAppTreeItem>;
        testNodes.forEach(async (node: IAzureParentNode<FunctionAppTreeItem>) => {
            if (node.treeItem.label === appName) {
                newlyDeployNode = node;
            } else {
                throw new Error();
            }
        });
        const functionsNode: IAzureNode<FunctionsTreeItem> = await newlyDeployNode.pickChildNode(['azFuncFunctions']);
        const functionTreeItem: FunctionTreeItem = <FunctionTreeItem>(await functionsNode.treeItem.loadMoreChildren())[0];
        if (functionTreeItem) {
            const httpTriggerUrl: string = functionTreeItem.triggerUrl;
            // try to hit http trigger
            const funcJsonOptions: request.OptionsWithUri = {
                method: 'GET',
                uri: `${httpTriggerUrl}&name=nathan`,
                resolveWithFullResponse: true
            };
            wait(5000);
            const response: IncomingMessage = await request(funcJsonOptions).promise();
            const assertedResponse: string = '"Hello nathan"';
            const assertedStatusCode: number = 200;
            assert.equal(response.body, assertedResponse);
            assert.equal(response.statusCode, assertedStatusCode);
        } else {
            throw new Error('Function did not deploy successfully');
        }

    });
});
