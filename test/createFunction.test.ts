/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createFunction } from '../src/commands/createFunction';
import { TemplateData } from '../src/templates/TemplateData';
import * as fsUtil from '../src/utils/fs';
import { TestAzureAccount } from './TestAzureAccount';
import { TestUI } from './TestUI';

const templateData: TemplateData = new TemplateData();
const testFolder: string = path.join(os.tmpdir(), `azFunc.createFuncTests${fsUtil.randomName()}`);
const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions Test');

suiteSetup(async () => {
    await fsUtil.makeFolder(testFolder);
    await fsUtil.makeFolder(path.join(testFolder, '.vscode'));
    // Pretend to create the parent function app
    await Promise.all([
        fsUtil.writeToFile(path.join(testFolder, 'host.json'), ''),
        fsUtil.writeToFile(path.join(testFolder, 'local.settings.json'), ''),
        fsUtil.writeToFile(path.join(testFolder, '.vscode', 'launch.json'), '')
    ]);
});

suiteTeardown(async () => {
    outputChannel.dispose();
    await fsUtil.deleteFolderAndContents(testFolder);
});

suite('Create Function Tests', () => {
    const blobTrigger: string = 'BlobTrigger';
    test(blobTrigger, async () => {
        await testCreateFunction(
            blobTrigger,
            'storageAccountConnection',
            undefined // Use default path
        );
    });

    const cosmosDBTrigger: string = 'CosmosDBTrigger';
    test(cosmosDBTrigger, async () => {
        await testCreateFunction(
            cosmosDBTrigger,
            'cosmosDBConnection',
            'dbName',
            'collectionName',
            undefined, // Use default for 'create leases if doesn't exist'
            undefined // Use default lease name
        );
    });

    const eventHubTrigger: string = 'EventHubTrigger';
    test(eventHubTrigger, async () => {
        await testCreateFunction(
            eventHubTrigger,
            'eventHubConnection',
            undefined, // Use default event hub name
            undefined // Use default event hub consumer group
        );
    });

    const genericWebhook: string = 'Generic Webhook';
    test(genericWebhook, async () => {
        await testCreateFunction(genericWebhook);
    });

    const gitHubWebhook: string = 'GitHub Webhook';
    test(gitHubWebhook, async () => {
        await testCreateFunction(gitHubWebhook);
    });

    const httpTrigger: string = 'HttpTrigger';
    test(httpTrigger, async () => {
        await testCreateFunction(
            httpTrigger,
            undefined // Use default Authorization level
        );
    });

    const httpTriggerWithParameters: string = 'HttpTriggerWithParameters';
    test(httpTriggerWithParameters, async () => {
        await testCreateFunction(
            httpTriggerWithParameters,
            undefined // Use default Authorization level
        );
    });

    const manualTrigger: string = 'ManualTrigger';
    test(manualTrigger, async () => {
        await testCreateFunction(manualTrigger);
    });

    const queueTrigger: string = 'QueueTrigger';
    test(queueTrigger, async () => {
        await testCreateFunction(
            queueTrigger,
            'storageAccountConnection',
            undefined // Use default queue name
        );
    });

    const serviceBusQueueTrigger: string = 'ServiceBusQueueTrigger';
    test(serviceBusQueueTrigger, async () => {
        await testCreateFunction(
            serviceBusQueueTrigger,
            'serviceBusConnection',
            'accessRights',
            undefined // Use default queue name
        );
    });

    const serviceBusTopicTrigger: string = 'ServiceBusTopicTrigger';
    test(serviceBusTopicTrigger, async () => {
        await testCreateFunction(
            serviceBusTopicTrigger,
            'serviceBusConnection',
            'accessRights',
            undefined, // Use default topic name
            undefined // Use default subscription name
        );
    });

    const timerTrigger: string = 'TimerTrigger';
    test(timerTrigger, async () => {
        await testCreateFunction(
            timerTrigger,
            undefined // Use default schedule
        );
    });
});

async function testCreateFunction(funcName: string, ...inputs: (string | undefined)[]): Promise<void> {
    // Setup common inputs
    inputs.unshift(funcName); // Specify the function name
    inputs.unshift(funcName); // Select the function template
    inputs.unshift(testFolder); // Select the test func app folder
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        inputs.unshift(undefined); // If the test environment has an open workspace, select the 'Browse...' option
    }

    const ui: TestUI = new TestUI(inputs);
    await createFunction(outputChannel, new TestAzureAccount(), templateData, ui);
    assert.equal(inputs.length, 0, 'Not all inputs were used.');

    const functionPath: string = path.join(testFolder, funcName);
    assert.equal(await fsUtil.fsPathExists(path.join(functionPath, 'index.js')), true, 'index.js does not exist');
    assert.equal(await fsUtil.fsPathExists(path.join(functionPath, 'function.json')), true, 'function.json does not exist');
}
