/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { durableUtils, FuncVersion, ProjectLanguage, type TemplateSource } from '../../extension.bundle';
import { backupLatestTemplateSources, isLongRunningVersion } from '../global.test';
import { getRotatingAuthLevel } from '../nightly/getRotatingValue';
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
    addSuite(FuncVersion.v4, 'net6.0', source, true);
    addSuite(FuncVersion.v4, 'net6.0', source, false);
    addSuite(FuncVersion.v4, 'net7.0', source, true);
    addSuite(FuncVersion.v4, 'net8.0', source, true);
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
        },
        {
            functionName: 'SQLInputBindingIsolated',
            inputs: [
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'TABLE'
            ]
        },
        {
            functionName: 'SQLOutputBindingIsolated',
            inputs: [
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'TABLE'
            ]
        },
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
    });
}
