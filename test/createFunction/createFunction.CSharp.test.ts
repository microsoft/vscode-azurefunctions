/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { FuncVersion, funcVersionSetting, ProjectLanguage, projectLanguageSetting, TemplateSource } from '../../extension.bundle';
import { allTemplateSources } from '../global.test';
import { runWithFuncSetting } from '../runWithSetting';
import { FunctionTesterBase } from './FunctionTesterBase';

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
        await fse.writeFile(path.join(testFolder, 'test.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup>
        <TargetFramework>${this._targetFramework}</TargetFramework>
    </PropertyGroup>
    <ItemGroup>
        <PackageReference Include="${this._isIsolated ? 'Microsoft.Azure.Functions.Worker.Sdk' : 'Microsoft.NET.Sdk.Functions'}" Version="1.0.0" />
    </ItemGroup>
</Project>`);
    }
}

for (const source of allTemplateSources) {
    addSuite(FuncVersion.v2, 'netcoreapp2.1', source);
    addSuite(FuncVersion.v3, 'netcoreapp3.1', source);
    addSuite(FuncVersion.v3, 'net5.0', source, true);
}

function addSuite(version: FuncVersion, targetFramework: string, source: TemplateSource, isIsolated?: boolean): void {
    const csTester: CSharpFunctionTester = new CSharpFunctionTester(version, targetFramework, source, !!isIsolated);
    let suiteName: string = csTester.suiteName + ` ${targetFramework}`;
    if (isIsolated) {
        suiteName += ' Isolated';
    }

    suite(suiteName, function (this: Mocha.Suite): void {
        this.timeout(40 * 1000);


        suiteSetup(async function (this: Mocha.Context): Promise<void> {
            this.timeout(120 * 1000);
            await csTester.initAsync();
        });

        suiteTeardown(async () => {
            await csTester.dispose();
        });

        const blobTrigger: string = 'Azure Blob Storage trigger';
        test(blobTrigger, async function (this: Mocha.Context): Promise<void> {
            // the first function created can take a lot longer - likely related to the dotnet cli's cache
            this.timeout(150 * 1000);

            await csTester.testCreateFunction(
                blobTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testpath'
            );
        });

        const cosmosTrigger: string = 'Azure Cosmos DB trigger';
        test(cosmosTrigger, async () => {
            await csTester.testCreateFunction(
                cosmosTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testDB',
                'testCollection'
            );
        });

        if (!isIsolated) {
            const durableTrigger: string = 'Durable Functions Orchestration';
            test(durableTrigger, async () => {
                await csTester.testCreateFunction(
                    durableTrigger,
                    'TestCompany.TestFunction'
                );
            });
        }

        // Doesn't work on v2: https://github.com/microsoft/vscode-azurefunctions/issues/792
        if (version !== FuncVersion.v2) {
            const eventGridTrigger: string = 'Azure Event Grid trigger';
            test(eventGridTrigger, async () => {
                await csTester.testCreateFunction(
                    eventGridTrigger,
                    'TestCompany.TestFunction'
                );
            });
        }

        const eventHubTrigger: string = 'Azure Event Hub trigger';
        test(eventHubTrigger, async () => {
            await csTester.testCreateFunction(
                eventHubTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testEventHub'
            );
        });

        if (!isIsolated) {
            const iotHubTrigger: string = 'IoT Hub (Event Hub)';
            test(iotHubTrigger, async () => {
                await csTester.testCreateFunction(
                    iotHubTrigger,
                    'TestCompany.TestFunction',
                    'AzureWebJobsStorage', // Use existing app setting
                    'testmessages/testevents'
                );
            });
        }

        const httpTrigger: string = 'HTTP trigger';
        test(httpTrigger, async () => {
            await csTester.testCreateFunction(
                httpTrigger,
                'TestCompany.TestFunction',
                'Admin'
            );
        });

        if (version !== FuncVersion.v2 && !isIsolated) { // not supported on V2 or Isolated
            const httpTriggerWithOpenAPI: string = 'HTTP trigger with OpenAPI';
            test(httpTriggerWithOpenAPI, async () => {
                await csTester.testCreateFunction(
                    httpTriggerWithOpenAPI,
                    'TestCompany.TestFunction',
                    'Admin'
                );
            });
        }

        const queueTrigger: string = 'Azure Queue Storage trigger';
        test(queueTrigger, async () => {
            await csTester.testCreateFunction(
                queueTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testqueue'
            );
        });

        const serviceBusQueueTrigger: string = 'Azure Service Bus Queue trigger';
        test(serviceBusQueueTrigger, async () => {
            await csTester.testCreateFunction(
                serviceBusQueueTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testQueue'
            );
        });

        const serviceBusTopicTrigger: string = 'Azure Service Bus Topic trigger';
        test(serviceBusTopicTrigger, async () => {
            await csTester.testCreateFunction(
                serviceBusTopicTrigger,
                'TestCompany.TestFunction',
                'AzureWebJobsStorage', // Use existing app setting
                'testTopic',
                'testSubscription'
            );
        });

        const timerTrigger: string = 'Timer trigger';
        test(timerTrigger, async () => {
            await csTester.testCreateFunction(
                timerTrigger,
                'TestCompany.TestFunction',
                '0 * * * */6 *'
            );
        });

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
                        await vscode.commands.executeCommand('azureFunctions.createFunction', csTester.projectPath, templateId, functionName, { namEspace: namespace, PaTh: iotPath, ConneCtion: connection });
                    });
                });
                await csTester.validateFunction(csTester.projectPath, functionName, [namespace, iotPath, connection]);
            });
        }
    });
}
