/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { FuncVersion, funcVersionSetting, ProjectLanguage, projectLanguageSetting, TemplateSource } from '../../extension.bundle';
import { allTemplateSources, isLongRunningVersion } from '../global.test';
import { getRotatingAuthLevel } from '../nightly/getRotatingValue';
import { runWithFuncSetting } from '../runWithSetting';
import { CreateFunctionTestCase, FunctionTesterBase } from './FunctionTesterBase';

class JavaScriptFunctionTester extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.JavaScript;

    public getExpectedPaths(functionName: string): string[] {
        return [
            path.join(functionName, 'function.json'),
            path.join(functionName, 'index.js')
        ];
    }
}

class TypeScriptFunctionTester extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.TypeScript;

    public getExpectedPaths(functionName: string): string[] {
        return [
            path.join(functionName, 'function.json'),
            path.join(functionName, 'index.ts')
        ];
    }
}

class PythonFunctionTester extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.Python;

    public getExpectedPaths(functionName: string): string[] {
        return [
            path.join(functionName, 'function.json'),
            path.join(functionName, '__init__.py')
        ];
    }
}

class PowerShellFunctionTester extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.PowerShell;

    public getExpectedPaths(functionName: string): string[] {
        return [
            path.join(functionName, 'function.json'),
            path.join(functionName, 'run.ps1')
        ];
    }
}

for (const version of [FuncVersion.v2, FuncVersion.v3, FuncVersion.v4]) {
    for (const source of allTemplateSources) {
        addSuite(new JavaScriptFunctionTester(version, source));
        addSuite(new TypeScriptFunctionTester(version, source));
        addSuite(new PythonFunctionTester(version, source));
        addSuite(new PowerShellFunctionTester(version, source));
    }
}

function addSuite(tester: FunctionTesterBase): void {
    const testCases: CreateFunctionTestCase[] = [
        {
            functionName: 'Azure Blob Storage trigger',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'test-path/{name}'
            ]
        },
        {
            functionName: 'Azure Cosmos DB trigger',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'dbName',
                'collectionName',
                'testLeases',
                'false' // 'create leases if doesn't exist'
            ]
        },
        {
            functionName: 'Azure Event Grid trigger',
            inputs: []
        },
        {
            functionName: 'Azure Event Hub trigger',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'eventHubName',
                'testConsumerGroup'
            ]
        },
        {
            functionName: 'HTTP trigger',
            inputs: [
                getRotatingAuthLevel()
            ]
        },
        {
            functionName: 'Azure Queue Storage trigger',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'testqueue'
            ]
        },
        {
            functionName: 'Azure Service Bus Queue trigger',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'testQueue'
            ]
        },
        {
            functionName: 'Azure Service Bus Topic trigger',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'testTopic',
                'testSubscription'
            ]
        },
        {
            functionName: 'Timer trigger',
            inputs: [
                '0 * * */3 * *'
            ]
        },
        {
            functionName: fixDurableLabel('Durable Functions activity'),
            inputs: [],
            skip: tester.language === ProjectLanguage.Custom
        },
        {
            functionName: fixDurableLabel('Durable Functions HTTP starter'),
            inputs: [
                getRotatingAuthLevel()
            ],
            skip: tester.language === ProjectLanguage.Custom
        },
        {
            functionName: fixDurableLabel('Durable Functions orchestrator'),
            inputs: [],
            skip: tester.language === ProjectLanguage.Custom
        },
        {
            functionName: 'IoT Hub (Event Hub)',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'testConsumerGroup'
            ],
            skip: tester.language === ProjectLanguage.Python
        },
        {
            functionName: 'SendGrid',
            inputs: [],
            skip: tester.language === ProjectLanguage.Python
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

    function fixDurableLabel(label: string): string {
        if (tester.language === ProjectLanguage.PowerShell && tester.source !== TemplateSource.Staging) {
            label += ' (preview)';
        }
        return label;
    }
}
