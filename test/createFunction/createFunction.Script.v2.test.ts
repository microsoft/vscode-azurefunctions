/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { FuncVersion, ProjectLanguage, durableUtils, funcVersionSetting, projectLanguageSetting } from '../../extension.bundle';
import { backupLatestTemplateSources, isLongRunningVersion } from '../global.test';
import { getRotatingAuthLevel } from '../nightly/getRotatingValue';
import { runWithFuncSetting } from '../runWithSetting';
import { FunctionTesterBase, type CreateFunctionTestCase } from './FunctionTesterBase';

abstract class NodeScriptFunctionTester extends FunctionTesterBase {
    protected override async initializeTestFolder(testFolder: string): Promise<void> {
        await super.initializeTestFolder(testFolder);
        const packageJsonContents = `{
            "dependencies": {
                "${durableUtils.nodeDfPackage}": "1.0.0"
            }
        }`;

        await AzExtFsExtra.writeFile(path.join(testFolder, 'package.json'), packageJsonContents);
    }
}

class JavaScriptFunctionTester extends NodeScriptFunctionTester {
    public language: ProjectLanguage = ProjectLanguage.JavaScript;

    public getExpectedPaths(functionName: string): string[] {
        return [
            path.join(functionName, 'function.json'),
            path.join(functionName, 'index.js')
        ];
    }
}

class TypeScriptFunctionTester extends NodeScriptFunctionTester {
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

    protected override async initializeTestFolder(testFolder: string): Promise<void> {
        await super.initializeTestFolder(testFolder);
        const requirementsContents = `${durableUtils.pythonDfPackage}`;
        await AzExtFsExtra.writeFile(path.join(testFolder, 'requirements.txt'), requirementsContents)
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


for (const source of backupLatestTemplateSources) {
    addSuite(new JavaScriptFunctionTester(FuncVersion.v4, source));
    addSuite(new TypeScriptFunctionTester(FuncVersion.v4, source));
    addSuite(new PythonFunctionTester(FuncVersion.v4, source));
    addSuite(new PowerShellFunctionTester(FuncVersion.v4, source));
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
            functionName: 'Durable Functions activity',
            inputs: [],
            skip: tester.language === ProjectLanguage.Custom
        },
        {
            functionName: 'Durable Functions HTTP starter',
            inputs: [
                getRotatingAuthLevel()
            ],
            skip: tester.language === ProjectLanguage.Custom
        },
        {
            functionName: 'Durable Functions orchestrator',
            inputs: [],
            skip: tester.language === ProjectLanguage.Custom
        },
        {
            functionName: 'Durable Functions entity',
            inputs: [],
            skip: tester.language === ProjectLanguage.PowerShell || tester.language === ProjectLanguage.Java
        },
        {
            functionName: 'Durable Functions Entity HTTP starter',
            inputs: tester.language === ProjectLanguage.JavaScript ? [] : [getRotatingAuthLevel()],
            skip: tester.language === ProjectLanguage.PowerShell || tester.language === ProjectLanguage.Java || tester.language === ProjectLanguage.Python
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
        },
        {
            functionName: 'Azure Blob Storage Trigger (using Event Grid)',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'samples-workitems/name'
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
