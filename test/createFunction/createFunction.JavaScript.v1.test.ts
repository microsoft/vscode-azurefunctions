/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { FuncVersion, funcVersionSetting, ProjectLanguage, projectLanguageSetting, TemplateSource } from '../../extension.bundle';
import { allTemplateSources } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { FunctionTesterBase } from './FunctionTesterBase';

class JSFunctionTesterV1 extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.JavaScript;

    public constructor(source: TemplateSource) {
        super(FuncVersion.v1, source);
    }

    public getExpectedPaths(functionName: string): string[] {
        return [
            path.join(functionName, 'function.json'),
            path.join(functionName, 'index.js')
        ];
    }
}

for (const source of allTemplateSources) {
    const jsTester: JSFunctionTesterV1 = new JSFunctionTesterV1(source);
    suite(jsTester.suiteName, function (this: Mocha.Suite): void {
        suiteSetup(async () => {
            await jsTester.initAsync();
        });

        suiteTeardown(async () => {
            await jsTester.dispose();
        });

        const blobTrigger: string = 'Blob trigger';
        test(blobTrigger, async () => {
            await jsTester.testCreateFunction(
                blobTrigger,
                'AzureWebJobsStorage', // Use existing app setting
                'test-path/{name}'
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
                'Admin'
            );
        });

        const httpTriggerWithParameters: string = 'HTTP trigger with parameters';
        test(httpTriggerWithParameters, async () => {
            await jsTester.testCreateFunction(
                httpTriggerWithParameters,
                'Anonymous'
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
                'testqueue'
            );
        });

        const timerTrigger: string = 'Timer trigger';
        test(timerTrigger, async () => {
            await jsTester.testCreateFunction(
                timerTrigger,
                '0 * 0/5 * * *'
            );
        });

        // https://github.com/Microsoft/vscode-azurefunctions/blob/main/docs/api.md#create-local-function
        test('createFunction API (deprecated)', async () => {
            const templateId: string = 'HttpTrigger-JavaScript';
            const functionName: string = 'createFunctionApi';
            const authLevel: string = 'Anonymous';
            // Intentionally testing weird casing for authLevel
            await runWithFuncSetting(projectLanguageSetting, ProjectLanguage.JavaScript, async () => {
                await runWithFuncSetting(funcVersionSetting, FuncVersion.v1, async () => {
                    await vscode.commands.executeCommand('azureFunctions.createFunction', jsTester.projectPath, templateId, functionName, { aUtHLevel: authLevel });
                });
            });
            await jsTester.validateFunction(jsTester.projectPath, functionName, [authLevel]);
        });
    });
}
