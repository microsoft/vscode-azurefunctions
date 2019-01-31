/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fse from 'fs-extra';
import { IHookCallbackContext, ISuiteCallbackContext } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting } from '../../extension.bundle';
import { runForAllTemplateSources } from '../global.test';
import { runWithSetting } from '../runWithSetting';
import { FunctionTesterBase } from './FunctionTesterBase';

class CSharpFunctionTester extends FunctionTesterBase {
    protected _language: ProjectLanguage = ProjectLanguage.CSharp;
    protected _runtime: ProjectRuntime = ProjectRuntime.v2;

    public async validateFunction(testFolder: string, funcName: string): Promise<void> {
        assert.equal(await fse.pathExists(path.join(testFolder, `${funcName}.cs`)), true, 'cs file does not exist');
    }
}

// tslint:disable-next-line:no-function-expression
suite('Create C# Function Tests', async function (this: ISuiteCallbackContext): Promise<void> {
    this.timeout(40 * 1000);

    const csTester: CSharpFunctionTester = new CSharpFunctionTester();

    // tslint:disable-next-line:no-function-expression
    suiteSetup(async function (this: IHookCallbackContext): Promise<void> {
        this.timeout(120 * 1000);
        await csTester.initAsync();
    });

    // tslint:disable-next-line:no-function-expression
    suiteTeardown(async function (this: IHookCallbackContext): Promise<void> {
        this.timeout(15 * 1000);
        await csTester.dispose();
    });

    const blobTrigger: string = 'BlobTrigger';
    test(blobTrigger, async () => {
        await csTester.testCreateFunction(
            blobTrigger,
            undefined, // namespace
            'AzureWebJobsStorage', // Use existing app setting
            undefined // Use default path
        );
    });

    const httpTrigger: string = 'HttpTrigger';
    test(httpTrigger, async () => {
        await csTester.testCreateFunction(
            httpTrigger,
            undefined, // namespace
            undefined // Use default Authorization level
        );
    });

    const queueTrigger: string = 'QueueTrigger';
    test(queueTrigger, async () => {
        await csTester.testCreateFunction(
            queueTrigger,
            undefined, // namespace
            'AzureWebJobsStorage', // Use existing app setting
            undefined // Use default queue name
        );
    });

    const timerTrigger: string = 'TimerTrigger';
    test(timerTrigger, async () => {
        await csTester.testCreateFunction(
            timerTrigger,
            undefined, // namespace
            undefined // Use default schedule
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
            await runWithSetting(projectLanguageSetting, ProjectLanguage.CSharp, async () => {
                await runWithSetting(projectRuntimeSetting, ProjectRuntime.v2, async () => {
                    await vscode.commands.executeCommand('azureFunctions.createFunction', projectPath, templateId, functionName, { namespace: namespace, Path: iotPath, Connection: connection });
                });
            });
            await csTester.validateFunction(projectPath, functionName);
        });
    });
});
