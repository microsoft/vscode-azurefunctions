/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { durableUtils, FuncVersion, funcVersionSetting, ProjectLanguage, projectLanguageSetting, type TemplateSource } from '../../extension.bundle';
import { backupLatestTemplateSources, isLongRunningVersion } from '../global.test';
import { getRotatingAuthLevel } from '../nightly/getRotatingValue';
import { runWithFuncSetting } from '../runWithSetting';
import { FunctionTesterBase, type CreateFunctionTestCase } from './FunctionTesterBase';

class CSharpFunctionTester extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.CSharp;
    private _targetFramework: string;
    private _isIsolated: boolean;

    public constructor(version: FuncVersion, targetFramework: string, source: TemplateSource, isIsolated: boolean) {
        super(version, source);
        this._targetFramework = targetFramework;
        this._isIsolated = isIsolated;
    }

    public getExpectedPaths(functionName: string): string[] {
        return [functionName + '.cs'];
    }

    protected async initializeTestFolder(testFolder: string): Promise<void> {
        await super.initializeTestFolder(testFolder);
        await AzExtFsExtra.writeFile(path.join(testFolder, 'test.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup>
        <TargetFramework>${this._targetFramework}</TargetFramework>
    </PropertyGroup>
    <ItemGroup>
        <PackageReference Include="${this._isIsolated ? 'Microsoft.Azure.Functions.Worker.Sdk' : 'Microsoft.NET.Sdk.Functions'}" Version="1.0.0" />
        <PackageReference Include="${durableUtils.dotnetInProcDfBasePackage}" Version="2.9.2" />
    </ItemGroup>
</Project>`);
    }
}

for (const source of backupLatestTemplateSources) {
    addSuite(FuncVersion.v2, 'netcoreapp2.1', source);
    addSuite(FuncVersion.v3, 'netcoreapp3.1', source);
    addSuite(FuncVersion.v4, 'net6.0', source, true);
    addSuite(FuncVersion.v4, 'net6.0', source, false);
    addSuite(FuncVersion.v4, 'net7.0', source, true);
}

function addSuite(version: FuncVersion, targetFramework: string, source: TemplateSource, isIsolated?: boolean): void {
    const testCases: CreateFunctionTestCase[] = [
        {
            functionName: 'Azure Blob Storage trigger',
            inputs: [
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testpath'
            ]
        },
        {
            functionName: 'Azure Cosmos DB trigger',
            inputs: [
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testDB',
                'testCollection'
            ]
        },
        {
            functionName: 'Durable Functions Orchestration',
            inputs: [
                'TestCompany.TestFunction'
            ],
            // skip: isIsolated
        },
        {
            functionName: 'Azure Event Grid trigger',
            inputs: [
                'TestCompany.TestFunction'
            ]
        },
        {
            functionName: 'EventGridCloudEventTrigger',
            inputs: [
                'TestCompany.TestFunction'
            ],
            skip: isIsolated,
        },
        {
            functionName: 'Azure Event Hub trigger',
            inputs: [
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testEventHub'
            ]
        },
        {
            functionName: 'IoT Hub (Event Hub)',
            inputs: [
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testmessages/testevents'
            ],
            skip: isIsolated
        },
        {
            functionName: 'HTTP trigger',
            inputs: [
                'TestCompany.TestFunction',
                getRotatingAuthLevel()
            ]
        },
        {
            functionName: 'HTTP trigger with OpenAPI',
            inputs: [
                'TestCompany.TestFunction',
                getRotatingAuthLevel()
            ],
            skip: version === FuncVersion.v2 || isIsolated
        },
        {
            functionName: 'Azure Queue Storage trigger',
            inputs: [
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testqueue'
            ]
        },
        {
            functionName: 'Azure Service Bus Queue trigger',
            inputs: [
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testQueue'
            ]
        },
        {
            functionName: 'Azure Service Bus Topic trigger',
            inputs: [
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testTopic',
                'testSubscription'
            ]
        },
        {
            functionName: 'Timer trigger',
            inputs: [
                'TestCompany.TestFunction',
                '0 * * * */6 *'
            ]
        },
        {
            functionName: 'Azure Blob Storage Trigger (using Event Grid)',
            inputs: [
                'AzureWebJobsStorage', // Use existing app setting
                'samples-workitems/name'
            ],
            skip: !isIsolated
        }
    ];

    const tester: CSharpFunctionTester = new CSharpFunctionTester(version, targetFramework, source, !!isIsolated);
    let title: string = tester.suiteName + ` ${targetFramework}`;
    if (isIsolated) {
        title += ' Isolated';
    }

    tester.addParallelSuite(testCases, {
        title,
        timeoutMS: 60 * 1000,
        isLongRunning: isLongRunningVersion(version),
        suppressParallel: true, // lots of errors like "The process cannot access the file because it is being used by another process" 😢
        addTests: () => {
            if (version === FuncVersion.v2) {
                // https://github.com/Microsoft/vscode-azurefunctions/blob/main/docs/api.md#create-local-function
                test('createFunction API (deprecated)', async () => {
                    // Intentionally testing IoTHub trigger since a partner team plans to use that
                    const templateId: string = 'Azure.Function.CSharp.IotHubTrigger.2.x';
                    const functionName: string = 'createFunctionApi';
                    const namespace: string = 'TestCompany.TestFunction';
                    const iotPath: string = 'messages/events';
                    const connection: string = 'IoTHub_Setting';
                    await runWithFuncSetting(projectLanguageSetting, ProjectLanguage.CSharp, async () => {
                        await runWithFuncSetting(funcVersionSetting, FuncVersion.v2, async () => {
                            // Intentionally testing weird casing
                            await vscode.commands.executeCommand('azureFunctions.createFunction', tester.projectPath, templateId, functionName, { namEspace: namespace, PaTh: iotPath, ConneCtion: connection });
                        });
                    });
                    await tester.validateFunction(tester.projectPath, functionName, [namespace, iotPath, connection]);
                });
            }
        }
    });
}
