/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, TestInput } from '../../extension.bundle';
import { runForAllTemplateSources } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { FunctionTesterBase } from './FunctionTesterBase';

class CSharpFunctionTester extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.CSharp;
    public runtime: ProjectRuntime = ProjectRuntime.v2;

    public async validateFunction(testFolder: string, funcName: string): Promise<void> {
        assert.equal(await fse.pathExists(path.join(testFolder, `${funcName}.cs`)), true, 'cs file does not exist');
    }
}

// tslint:disable-next-line:no-function-expression max-func-body-length
suite('Create C# ~2 Function', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(40 * 1000);

    const csTester: CSharpFunctionTester = new CSharpFunctionTester();

    // tslint:disable-next-line:no-function-expression
    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        this.timeout(120 * 1000);
        await csTester.initAsync();
    });

    const blobTrigger: string = 'BlobTrigger';
    test(blobTrigger, async () => {
        await csTester.testCreateFunction(
            blobTrigger,
            TestInput.UseDefaultValue, // namespace
            'AzureWebJobsStorage', // Use existing app setting
            TestInput.UseDefaultValue // Use default path
        );
    });

    const cosmosTrigger: string = 'CosmosDBTrigger';
    test(cosmosTrigger, async () => {
        await csTester.testCreateFunction(
            cosmosTrigger,
            TestInput.UseDefaultValue, // namespace
            'AzureWebJobsStorage', // Use existing app setting
            TestInput.UseDefaultValue, // Use default database name
            TestInput.UseDefaultValue // Use default collection name
        );
    });

    const durableTrigger: string = 'DurableFunctionsOrchestration';
    test(durableTrigger, async () => {
        await csTester.testCreateFunction(
            durableTrigger,
            TestInput.UseDefaultValue // namespace
        );
    });

    const eventHubTrigger: string = 'EventHubTrigger';
    test(eventHubTrigger, async () => {
        await csTester.testCreateFunction(
            eventHubTrigger,
            TestInput.UseDefaultValue, // namespace
            'AzureWebJobsStorage', // Use existing app setting
            'eventHubName'
        );
    });

    const httpTrigger: string = 'HttpTrigger';
    test(httpTrigger, async () => {
        await csTester.testCreateFunction(
            httpTrigger,
            TestInput.UseDefaultValue, // namespace
            TestInput.UseDefaultValue // Use default Authorization level
        );
    });

    const queueTrigger: string = 'QueueTrigger';
    test(queueTrigger, async () => {
        await csTester.testCreateFunction(
            queueTrigger,
            TestInput.UseDefaultValue, // namespace
            'AzureWebJobsStorage', // Use existing app setting
            TestInput.UseDefaultValue // Use default queue name
        );
    });

    const serviceBusQueueTrigger: string = 'ServiceBusQueueTrigger';
    test(serviceBusQueueTrigger, async () => {
        await csTester.testCreateFunction(
            serviceBusQueueTrigger,
            TestInput.UseDefaultValue, // namespace
            'AzureWebJobsStorage', // Use existing app setting
            TestInput.UseDefaultValue // Use default queue name
        );
    });

    const serviceBusTopicTrigger: string = 'ServiceBusTopicTrigger';
    test(serviceBusTopicTrigger, async () => {
        await csTester.testCreateFunction(
            serviceBusTopicTrigger,
            TestInput.UseDefaultValue, // namespace
            'AzureWebJobsStorage', // Use existing app setting
            TestInput.UseDefaultValue, // Use default topic name
            TestInput.UseDefaultValue // Use default subscription name
        );
    });

    const timerTrigger: string = 'TimerTrigger';
    test(timerTrigger, async () => {
        await csTester.testCreateFunction(
            timerTrigger,
            TestInput.UseDefaultValue, // namespace
            TestInput.UseDefaultValue // Use default schedule
        );
    });

    // https://github.com/Microsoft/vscode-azurefunctions/blob/master/docs/api.md#create-local-function
    test('createFunction API', async () => {
        await runForAllTemplateSources(async (source) => {
            // Intentionally testing IoTHub trigger since a partner team plans to use that
            const templateId: string = 'Azure.Function.CSharp.IotHubTrigger.2.x';
            const functionName: string = 'createFunctionApi';
            const namespace: string = 'Company.Function';
            const iotPath: string = 'messages/events';
            const connection: string = 'IoTHub_Setting';
            const projectPath: string = path.join(csTester.baseTestFolder, source);
            await runWithFuncSetting(projectLanguageSetting, ProjectLanguage.CSharp, async () => {
                await runWithFuncSetting(projectRuntimeSetting, ProjectRuntime.v2, async () => {
                    await vscode.commands.executeCommand('azureFunctions.createFunction', projectPath, templateId, functionName, { namespace: namespace, Path: iotPath, Connection: connection });
                });
            });
            await csTester.validateFunction(projectPath, functionName);
        });
    });
});
