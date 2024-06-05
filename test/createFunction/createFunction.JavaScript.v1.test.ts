/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { FuncVersion, ProjectLanguage, type TemplateSource } from '../../extension.bundle';
import { backupLatestTemplateSources, shouldSkipVersion } from '../global.test';
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

for (const source of backupLatestTemplateSources) {
    const jsTester: JSFunctionTesterV1 = new JSFunctionTesterV1(source);
    suite(jsTester.suiteName, function (this: Mocha.Suite): void {
        suiteSetup(async function (this: Mocha.Context): Promise<void> {
            if (shouldSkipVersion(jsTester.version)) {
                this.skip();
            }

            await jsTester.initAsync();
        });

        suiteTeardown(async () => {
            if (!shouldSkipVersion(jsTester.version)) {
                await jsTester.dispose();
            }
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
    });
}
