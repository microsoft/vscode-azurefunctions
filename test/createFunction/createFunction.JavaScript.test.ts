/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { JavaScriptProjectCreator } from '../../src/commands/createNewProject/JavaScriptProjectCreator';
import { ProjectLanguage, ProjectRuntime } from '../../src/constants';
import { FunctionTesterBase } from './FunctionTesterBase';

class JSFunctionTester extends FunctionTesterBase {
    protected _language: ProjectLanguage = ProjectLanguage.JavaScript;
    protected _runtime: ProjectRuntime = JavaScriptProjectCreator.defaultRuntime;

    public async validateFunction(testFolder: string, funcName: string): Promise<void> {
        const functionPath: string = path.join(testFolder, funcName);
        assert.equal(await fse.pathExists(path.join(functionPath, 'index.js')), true, 'index.js does not exist');
        assert.equal(await fse.pathExists(path.join(functionPath, 'function.json')), true, 'function.json does not exist');
    }
}

// tslint:disable-next-line:max-func-body-length no-function-expression
suite('Create JavaScript Function Tests', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(6 * 1000);

    const jsTester: JSFunctionTester = new JSFunctionTester();

    suiteSetup(async () => {
        await jsTester.initAsync();
    });

    // tslint:disable-next-line:no-function-expression
    suiteTeardown(async function (this: IHookCallbackContext): Promise<void> {
        this.timeout(15 * 1000);
        await jsTester.dispose();
    });

    const blobTrigger: string = 'Blob trigger';
    test(blobTrigger, async () => {
        await jsTester.testCreateFunction(
            blobTrigger,
            'AzureWebJobsStorage', // Use existing app setting
            undefined // Use default path
        );
    });

    const cosmosDBTrigger: string = 'Cosmos DB trigger';
    test(cosmosDBTrigger, async () => {
        await jsTester.testCreateFunction(
            cosmosDBTrigger,
            'AzureWebJobsStorage', // Use existing app setting
            'dbName',
            'collectionName',
            undefined, // Use default for 'create leases if doesn't exist'
            undefined // Use default lease name
        );
    });

    const eventHubTrigger: string = 'Event Hub trigger';
    test(eventHubTrigger, async () => {
        await jsTester.testCreateFunction(
            eventHubTrigger,
            'AzureWebJobsStorage', // Use existing app setting
            undefined, // Use default event hub name
            undefined // Use default event hub consumer group
        );
    });

    const genericWebhook: string = 'Generic webhook';
    test(genericWebhook, async () => {
        await jsTester.testCreateFunction(genericWebhook);
    });

    const gitHubWebhook: string = 'GitHub webhook';
    test(gitHubWebhook, async () => {
        await jsTester.testCreateFunction(gitHubWebhook);
    });

    const httpTrigger: string = 'HTTP trigger';
    test(httpTrigger, async () => {
        await jsTester.testCreateFunction(
            httpTrigger,
            undefined // Use default Authorization level
        );
    });

    const httpTriggerWithParameters: string = 'HTTP trigger with parameters';
    test(httpTriggerWithParameters, async () => {
        await jsTester.testCreateFunction(
            httpTriggerWithParameters,
            undefined // Use default Authorization level
        );
    });

    const manualTrigger: string = 'Manual trigger';
    test(manualTrigger, async () => {
        await jsTester.testCreateFunction(manualTrigger);
    });

    const queueTrigger: string = 'Queue trigger';
    test(queueTrigger, async () => {
        await jsTester.testCreateFunction(
            queueTrigger,
            'AzureWebJobsStorage', // Use existing app setting
            undefined // Use default queue name
        );
    });

    const serviceBusQueueTrigger: string = 'Service Bus Queue trigger';
    test(serviceBusQueueTrigger, async () => {
        await jsTester.testCreateFunction(
            serviceBusQueueTrigger,
            'AzureWebJobsStorage', // Use existing app setting
            undefined, // Use default access rights
            undefined // Use default queue name
        );
    });

    const serviceBusTopicTrigger: string = 'Service Bus Topic trigger';
    test(serviceBusTopicTrigger, async () => {
        await jsTester.testCreateFunction(
            serviceBusTopicTrigger,
            'AzureWebJobsStorage', // Use existing app setting
            undefined, // Use default access rights
            undefined, // Use default topic name
            undefined // Use default subscription name
        );
    });

    const timerTrigger: string = 'Timer trigger';
    test(timerTrigger, async () => {
        await jsTester.testCreateFunction(
            timerTrigger,
            undefined // Use default schedule
        );
    });

    test('createFunction API', async () => {
        const templateId: string = 'HttpTrigger-JavaScript';
        const functionName: string = 'createFunctionApi';
        const authLevel: string = 'Anonymous';
        // Intentionally testing weird casing for authLevel
        await vscode.commands.executeCommand('azureFunctions.createFunction', jsTester.funcPortalTestFolder, templateId, functionName, { aUtHLevel: authLevel });
        await jsTester.validateFunction(jsTester.funcPortalTestFolder, functionName);
    });
});
