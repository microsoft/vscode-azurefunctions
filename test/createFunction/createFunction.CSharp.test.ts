/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { FuncVersion, funcVersionSetting, ProjectLanguage, projectLanguageSetting } from '../../extension.bundle';
import { runForAllTemplateSources } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { FunctionTesterBase } from './FunctionTesterBase';

class CSharpFunctionTester extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.CSharp;

    public getExpectedPaths(functionName: string): string[] {
        return [functionName + '.cs'];
    }
}

addSuite(FuncVersion.v2);
addSuite(FuncVersion.v3);

// tslint:disable-next-line:no-function-expression max-func-body-length
function addSuite(version: FuncVersion): void {
    // tslint:disable-next-line:no-function-expression max-func-body-length
    suite(`Create Function C# ${version}`, async function (this: ISuiteCallbackContext): Promise<void> {
        this.timeout(40 * 1000);

        const csTester: CSharpFunctionTester = new CSharpFunctionTester(version);

        // tslint:disable-next-line:no-function-expression
        suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
            this.timeout(120 * 1000);
            await csTester.initAsync();
        });

        suiteTeardown(async () => {
            await csTester.dispose();
        });

        const blobTrigger: string = 'BlobTrigger';
        test(blobTrigger, async () => {
            await csTester.testCreateFunction(
                blobTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testpath'
            );
        });

        const cosmosTrigger: string = 'CosmosDBTrigger';
        test(cosmosTrigger, async () => {
            await csTester.testCreateFunction(
                cosmosTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testDB',
                'testCollection'
            );
        });

        const durableTrigger: string = 'DurableFunctionsOrchestration';
        test(durableTrigger, async () => {
            await csTester.testCreateFunction(
                durableTrigger,
                'TestCompany.TestFunction'
            );
        });

        const eventHubTrigger: string = 'EventHubTrigger';
        test(eventHubTrigger, async () => {
            await csTester.testCreateFunction(
                eventHubTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testEventHub'
            );
        });

        const httpTrigger: string = 'HttpTrigger';
        test(httpTrigger, async () => {
            await csTester.testCreateFunction(
                httpTrigger,
                'TestCompany.TestFunction',
                'Admin'
            );
        });

        const queueTrigger: string = 'QueueTrigger';
        test(queueTrigger, async () => {
            await csTester.testCreateFunction(
                queueTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testqueue'
            );
        });

        const serviceBusQueueTrigger: string = 'ServiceBusQueueTrigger';
        test(serviceBusQueueTrigger, async () => {
            await csTester.testCreateFunction(
                serviceBusQueueTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testQueue'
            );
        });

        const serviceBusTopicTrigger: string = 'ServiceBusTopicTrigger';
        test(serviceBusTopicTrigger, async () => {
            await csTester.testCreateFunction(
                serviceBusTopicTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testTopic',
                'testSubscription'
            );
        });

        const timerTrigger: string = 'TimerTrigger';
        test(timerTrigger, async () => {
            await csTester.testCreateFunction(
                timerTrigger,
                'TestCompany.TestFunction',
                '0 * * * */6 *'
            );
        });

        // https://github.com/Microsoft/vscode-azurefunctions/blob/master/docs/api.md#create-local-function
        test('createFunction API', async () => {
            await runForAllTemplateSources(async (source) => {
                // Intentionally testing IoTHub trigger since a partner team plans to use that
                const templateId: string = 'Azure.Function.CSharp.IotHubTrigger.2.x';
                const functionName: string = 'createFunctionApi';
                const namespace: string = 'TestCompany.TestFunction';
                const iotPath: string = 'messages/events';
                const connection: string = 'IoTHub_Setting';
                const projectPath: string = path.join(csTester.baseTestFolder, source);
                await runWithFuncSetting(projectLanguageSetting, ProjectLanguage.CSharp, async () => {
                    await runWithFuncSetting(funcVersionSetting, FuncVersion.v2, async () => {
                        // Intentionally testing weird casing
                        await vscode.commands.executeCommand('azureFunctions.createFunction', projectPath, templateId, functionName, { namEspace: namespace, PaTh: iotPath, ConneCtion: connection });
                    });
                });
                await csTester.validateFunction(projectPath, functionName, [namespace, iotPath, connection]);
            });
        });
    });
}
