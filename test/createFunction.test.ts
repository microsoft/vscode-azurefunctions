/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceConfiguration } from 'vscode';
import { createFunction } from '../src/commands/createFunction/createFunction';
import { extensionPrefix, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TemplateFilter, templateFilterSetting } from '../src/ProjectSettings';
import { TemplateData } from '../src/templates/TemplateData';
import * as fsUtil from '../src/utils/fs';
import { TestAzureAccount } from './TestAzureAccount';
import { TestUI } from './TestUI';

const templateData: TemplateData = new TemplateData();
const testFolder: string = path.join(os.tmpdir(), `azFunc.createFuncTests${fsUtil.getRandomHexString()}`);
const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Azure Functions Test');

const projectConfiguration: WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionPrefix);
// tslint:disable-next-line:no-backbone-get-set-outside-model
const oldTemplateFilter: string | undefined = projectConfiguration.get(templateFilterSetting);
const oldProjectLanguage: string | undefined = projectConfiguration.get(projectLanguageSetting);
const oldProjectRuntime: string | undefined = projectConfiguration.get(projectRuntimeSetting);

suiteSetup(async () => {
    await fse.ensureDir(path.join(testFolder, '.vscode'));
    // Pretend to create the parent function app
    await Promise.all([
        fse.writeFile(path.join(testFolder, 'host.json'), ''),
        fse.writeFile(path.join(testFolder, 'local.settings.json'), '{ "Values": { "AzureWebJobsStorage": "test" } }'),
        fse.writeFile(path.join(testFolder, '.vscode', 'launch.json'), '')
    ]);
    await projectConfiguration.update(templateFilterSetting, TemplateFilter.Core, vscode.ConfigurationTarget.Global);
    await projectConfiguration.update(projectLanguageSetting, ProjectLanguage.JavaScript, vscode.ConfigurationTarget.Global);
    await projectConfiguration.update(projectRuntimeSetting, ProjectRuntime.one, vscode.ConfigurationTarget.Global);
});

suiteTeardown(async () => {
    outputChannel.dispose();
    await fse.remove(testFolder);
    await projectConfiguration.update(templateFilterSetting, oldTemplateFilter, vscode.ConfigurationTarget.Global);
    await projectConfiguration.update(projectLanguageSetting, oldProjectLanguage, vscode.ConfigurationTarget.Global);
    await projectConfiguration.update(projectRuntimeSetting, oldProjectRuntime, vscode.ConfigurationTarget.Global);
});

// tslint:disable-next-line:max-func-body-length
suite('Create Core Function Tests', () => {
    const blobTrigger: string = 'Blob trigger';
    test(blobTrigger, async () => {
        await testCreateFunction(
            blobTrigger,
            undefined, // New App Setting
            'connectionStringKey1',
            'connectionString',
            undefined // Use default path
        );
    });

    const cosmosDBTrigger: string = 'Cosmos DB trigger';
    test(cosmosDBTrigger, async () => {
        await testCreateFunction(
            cosmosDBTrigger,
            undefined, // New App Setting
            'connectionStringKey2',
            'connectionString',
            'dbName',
            'collectionName',
            undefined, // Use default for 'create leases if doesn't exist'
            undefined // Use default lease name
        );
    });

    const eventHubTrigger: string = 'Event Hub trigger';
    test(eventHubTrigger, async () => {
        await testCreateFunction(
            eventHubTrigger,
            undefined, // New App Setting
            'connectionStringKey3',
            'connectionString',
            undefined, // Use default event hub name
            undefined // Use default event hub consumer group
        );
    });

    const genericWebhook: string = 'Generic webhook';
    test(genericWebhook, async () => {
        await testCreateFunction(genericWebhook);
    });

    const gitHubWebhook: string = 'GitHub webhook';
    test(gitHubWebhook, async () => {
        await testCreateFunction(gitHubWebhook);
    });

    const httpTrigger: string = 'HTTP trigger';
    test(httpTrigger, async () => {
        await testCreateFunction(
            httpTrigger,
            undefined // Use default Authorization level
        );
    });

    const httpTriggerWithParameters: string = 'HTTP trigger with parameters';
    test(httpTriggerWithParameters, async () => {
        await testCreateFunction(
            httpTriggerWithParameters,
            undefined // Use default Authorization level
        );
    });

    const manualTrigger: string = 'Manual trigger';
    test(manualTrigger, async () => {
        await testCreateFunction(manualTrigger);
    });

    const queueTrigger: string = 'Queue trigger';
    test(queueTrigger, async () => {
        await testCreateFunction(
            queueTrigger,
            undefined, // New App Setting
            'connectionStringKey4',
            'connectionString',
            undefined // Use default queue name
        );
    });

    const serviceBusQueueTrigger: string = 'Service Bus Queue trigger';
    test(serviceBusQueueTrigger, async () => {
        await testCreateFunction(
            serviceBusQueueTrigger,
            undefined, // New App Setting
            'connectionStringKey5',
            'connectionString',
            undefined, // Use default access rights
            undefined // Use default queue name
        );
    });

    const serviceBusTopicTrigger: string = 'Service Bus Topic trigger';
    test(serviceBusTopicTrigger, async () => {
        await testCreateFunction(
            serviceBusTopicTrigger,
            undefined, // New App Setting
            'connectionStringKey6',
            'connectionString',
            undefined, // Use default access rights
            undefined, // Use default topic name
            undefined // Use default subscription name
        );
    });

    const timerTrigger: string = 'Timer trigger';
    test(timerTrigger, async () => {
        await testCreateFunction(
            timerTrigger,
            undefined // Use default schedule
        );
    });
});

async function testCreateFunction(templateName: string, ...inputs: (string | undefined)[]): Promise<void> {
    // Setup common inputs
    const funcName: string = templateName.replace(/ /g, '');
    inputs.unshift(funcName); // Specify the function name
    inputs.unshift(templateName); // Select the function template
    inputs.unshift(testFolder); // Select the test func app folder
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        inputs.unshift(undefined); // If the test environment has an open workspace, select the 'Browse...' option
    }

    const ui: TestUI = new TestUI(inputs);
    await createFunction({}, outputChannel, new TestAzureAccount(), templateData, ui);
    assert.equal(inputs.length, 0, 'Not all inputs were used.');

    const functionPath: string = path.join(testFolder, funcName);
    assert.equal(await fse.pathExists(path.join(functionPath, 'index.js')), true, 'index.js does not exist');
    assert.equal(await fse.pathExists(path.join(functionPath, 'function.json')), true, 'function.json does not exist');
}
