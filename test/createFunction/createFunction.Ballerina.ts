/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { FuncVersion, ProjectLanguage, funcVersionSetting, projectLanguageSetting } from '../../extension.bundle';
import { backupLatestTemplateSources, isLongRunningVersion } from '../global.test';
import { getRotatingAuthLevel } from '../nightly/getRotatingValue';
import { runWithFuncSetting } from '../runWithSetting';
import { FunctionTesterBase, type CreateFunctionTestCase } from './FunctionTesterBase';

class BallerinaFunctionTester extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.Ballerina;

    public getExpectedPaths(functionName: string): string[] {
        return [
            path.join(functionName + '.bal')
        ];
    }
}

for (const version of [FuncVersion.v2, FuncVersion.v3, FuncVersion.v4]) {
    for (const source of backupLatestTemplateSources) {
        addSuite(new BallerinaFunctionTester(version, source));
    }
}

function addSuite(tester: FunctionTesterBase): void {
    const testCases: CreateFunctionTestCase[] = [
        {
            functionName: 'Blob trigger',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'test-path/{name}'
            ]
        },
        {
            functionName: 'CosmosDB trigger',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'dbName',
                'collectionName'
            ]
        },
        {
            functionName: 'HTTP trigger',
            inputs: [
                getRotatingAuthLevel()
            ]
        },
        {
            functionName: 'Queue trigger',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'testqueue'
            ]
        },
        {
            functionName: 'Timer trigger',
            inputs: [
                '0 * * */3 * *'
            ]
        }
    ];

    tester.addParallelSuite(testCases, {
        isLongRunning: isLongRunningVersion(tester.version),
        addTests: () => {
            // https://github.com/Microsoft/vscode-azurefunctions/blob/main/docs/api.md#create-local-function
            test('createFunction API (deprecated)', async () => {
                const templateId: string = `HttpTrigger-${tester.language}`;
                const functionName: string = 'createFunctionApi';
                const authLevel: string = 'Anonymous';
                // Intentionally testing weird casing for authLevel
                await runWithFuncSetting(projectLanguageSetting, tester.language, async () => {
                    await runWithFuncSetting(funcVersionSetting, tester.version, async () => {
                        await vscode.commands.executeCommand('azureFunctions.createFunction', tester.projectPath, templateId, functionName, { aUtHLevel: authLevel });
                    });
                });
                await tester.validateFunction(tester.projectPath, functionName, [authLevel]);
            });
        }
    });
}
