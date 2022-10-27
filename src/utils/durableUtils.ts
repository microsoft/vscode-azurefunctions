/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, IActionContext, IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import * as path from "path";
import { Uri } from "vscode";
import * as xml2js from "xml2js";
import { EventHubsConnectionExecuteStep } from "../commands/appSettings/EventHubsConnectionExecuteStep";
import { EventHubsConnectionPromptStep } from "../commands/appSettings/EventHubsConnectionPromptStep";
import { IValidateConnectionOptions } from "../commands/appSettings/IConnectionPrompOptions";
import { IEventHubsConnectionWizardContext } from "../commands/appSettings/IEventHubsConnectionWizardContext";
import { ISqlDatabaseConnectionWizardContext } from "../commands/appSettings/ISqlDatabaseConnectionWizardContext";
import { SqlDatabaseConnectionExecuteStep } from "../commands/appSettings/SqlDatabaseConnectionExecuteStep";
import { SqlDatabaseConnectionPromptStep } from "../commands/appSettings/SqlDatabaseConnectionPromptStep";
import { NetheriteConfigureHostStep } from "../commands/createFunction/durableSteps/netherite/NetheriteConfigureHostStep";
import { NetheriteEventHubNameStep } from "../commands/createFunction/durableSteps/netherite/NetheriteEventHubNameStep";
import { SqlDatabaseListStep } from "../commands/createFunction/durableSteps/sql/SqlDatabaseListStep";
import { IFunctionWizardContext } from "../commands/createFunction/IFunctionWizardContext";
import { ConnectionKey, DurableBackend, DurableBackendValues, hostFileName, localEventHubsEmulatorConnectionRegExp, ProjectLanguage } from "../constants";
import { IHostJsonV2, INetheriteTaskJson, ISqlTaskJson, IStorageTaskJson } from "../funcConfig/host";
import { getLocalConnectionString } from "../funcConfig/local.settings";
import { emptyWorkspace, localize } from "../localize";
import { findFiles, getWorkspaceRootPath } from "./workspace";

export namespace durableUtils {
    export const dotnetDfSqlPackage: string = 'Microsoft.DurableTask.SqlServer.AzureFunctions';
    export const dotnetDfNetheritePackage: string = 'Microsoft.Azure.DurableTask.Netherite.AzureFunctions';
    export const dotnetDfBasePackage: string = 'Microsoft.Azure.WebJobs.Extensions.DurableTask';
    export const nodeDfPackage: string = 'durable-functions';
    export const pythonDfPackage: string = 'azure-functions-durable';

    export function requiresDurableStorage(templateId: string, language?: string): boolean {
        // Todo: Remove when Powershell and Java implementation is added
        if (language === ProjectLanguage.PowerShell || language === ProjectLanguage.Java) {
            return false;
        }

        const durableEntity = /DurableFunctionsEntity/i;
        const durableOrchestrator: RegExp = /DurableFunctionsOrchestrat/i;  // Sometimes ends with 'or' or 'ion'

        return durableOrchestrator.test(templateId) || durableEntity.test(templateId);
    }

    export async function promptForStorageType(context: IFunctionWizardContext): Promise<DurableBackendValues> {
        const durableStorageOptions: string[] = [
            'Durable Functions Orchestration using Storage',
            'Durable Functions Orchestration using Netherite',
            'Durable Functions Orchestration using SQL'
        ];

        const placeHolder: string = localize('chooseDurableStorageType', 'Choose a durable storage type.');
        const picks: IAzureQuickPickItem<DurableBackendValues>[] = [
            { label: durableStorageOptions[0], data: DurableBackend.Storage },
            { label: durableStorageOptions[1], data: DurableBackend.Netherite },
            { label: durableStorageOptions[2], data: DurableBackend.SQL }
        ];
        return (await context.ui.showQuickPick(picks, { placeHolder })).data;
    }

    export async function getStorageTypeFromWorkspace(language: string | undefined, projectPath?: string): Promise<DurableBackendValues | undefined> {
        projectPath ??= getWorkspaceRootPath();
        if (!projectPath) {
            return;
        }

        const hasDurableStorage: boolean = await verifyHasDurableStorage(language, projectPath);
        if (!hasDurableStorage) {
            return;
        }

        const hostJsonPath = path.join(projectPath, hostFileName);
        if (!AzExtFsExtra.pathExists(hostJsonPath)) {
            return;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath);
        const hostStorageType: DurableBackendValues | undefined = hostJson.extensions?.durableTask?.storageProvider?.type;

        switch (hostStorageType) {
            case DurableBackend.Netherite:
                return DurableBackend.Netherite;
            case DurableBackend.SQL:
                return DurableBackend.SQL;
            case DurableBackend.Storage:
            default:
                // New DF's will use the more specific type 'DurableBackend.Storage', but legacy implementations may return this value as 'undefined'
                return DurableBackend.Storage;
        }
    };


    // !------ Verify Durable Storage/Dependencies ------
    // Use workspace dependencies as an indicator to check whether this project already has durable storage setup
    export async function verifyHasDurableStorage(language: string | undefined, projectPath?: string): Promise<boolean> {
        projectPath ??= getWorkspaceRootPath();
        if (!projectPath) {
            return false;
        }

        switch (language) {
            case ProjectLanguage.Java:
                // ???
                return false;
            case ProjectLanguage.JavaScript:
            case ProjectLanguage.TypeScript:
                return await nodeProjectHasDurableDependency(projectPath);
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                return await dotnetProjectHasDurableDependency(projectPath);
            case ProjectLanguage.PowerShell:
                // ???
                return false;
            case ProjectLanguage.Python:
                return await pythonProjectHasDurableDependency(projectPath);
            default:
                return false;
        }
    }

    async function nodeProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        const packagePath: string = path.join(projectPath, 'package.json');
        if (!AzExtFsExtra.pathExists(packagePath)) {
            return false;
        }

        const packageJson: Record<string, any> = await AzExtFsExtra.readJSON(packagePath);
        const dependencies = packageJson.dependencies || {};
        return !!dependencies[nodeDfPackage];
    }

    async function dotnetProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        const csProjPaths: Uri[] = await findFiles(projectPath, '*.csproj');
        if (!csProjPaths?.[0]?.path) {
            return false;
        }

        const csProjContents: string = await AzExtFsExtra.readFile(csProjPaths[0].path);

        return new Promise((resolve) => {
            xml2js.parseString(csProjContents, { explicitArray: false }, (err: any, result: any): void => {
                if (result && !err) {
                    let packageReferences = result?.['Project']?.['ItemGroup']?.[0]?.PackageReference ?? [];
                    packageReferences = (packageReferences instanceof Array) ? packageReferences : [packageReferences];

                    for (const packageRef of packageReferences) {
                        if (packageRef['$'] && packageRef['$']['Include']) {
                            if (packageRef['$']['Include'] === dotnetDfBasePackage) {
                                resolve(true);
                                return;
                            }
                        }
                    }
                }
                resolve(false);
            });
        });
    }

    async function pythonProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        const requirementsPath: string = path.join(projectPath, 'requirements.txt');
        if (!AzExtFsExtra.pathExists(requirementsPath)) {
            return false;
        }

        const contents: string = await AzExtFsExtra.readFile(requirementsPath);
        const lines: string[] = contents.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line === pythonDfPackage) {
                return true;
            }
        }
        return false;
    }

    export function getDefaultStorageTaskConfig(): IStorageTaskJson {
        return {
            storageProvider: {
                type: DurableBackend.Storage,
            }
        };
    }
}


export namespace netheriteUtils {
    export const defaultNetheriteHubName: string = 'HelloNetheriteHub';  // Arbitrary placeholder for running in emulator mode until an Azure connection is setup

    export async function getEventHubName(projectPath?: string): Promise<string | undefined> {
        projectPath ??= getWorkspaceRootPath();
        if (!projectPath) {
            throw new Error(emptyWorkspace);
        }

        const hostJsonPath = path.join(projectPath, hostFileName);
        if (!AzExtFsExtra.pathExists(hostJsonPath)) {
            return;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath);
        const taskJson: INetheriteTaskJson = hostJson.extensions?.durableTask as INetheriteTaskJson;
        return taskJson?.hubName;
    }

    export async function validateConnection(context: IActionContext, options?: Omit<IValidateConnectionOptions, 'suppressSkipForNow'>, projectPath?: string): Promise<void> {
        projectPath ??= getWorkspaceRootPath();
        if (!projectPath) {
            throw new Error(emptyWorkspace);
        }

        const eventHubsConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.EventHub, projectPath);
        const hasEventHubsConnection: boolean = !!eventHubsConnection && !localEventHubsEmulatorConnectionRegExp.test(eventHubsConnection);

        const eventHubName: string | undefined = await getEventHubName(projectPath);
        const hasValidEventHubName: boolean = !!eventHubName && eventHubName !== netheriteUtils.defaultNetheriteHubName;

        const wizardContext: IEventHubsConnectionWizardContext = Object.assign(context, { projectPath });
        const promptSteps: AzureWizardPromptStep<IEventHubsConnectionWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<IEventHubsConnectionWizardContext>[] = [];

        if (hasEventHubsConnection && hasValidEventHubName && options?.setConnectionForDeploy) {
            Object.assign(context, { eventHubConnectionForDeploy: eventHubsConnection });
        } else {
            promptSteps.push(new EventHubsConnectionPromptStep({ preSelectedConnectionType: options?.preSelectedConnectionType, suppressSkipForNow: true }));
            executeSteps.push(new EventHubsConnectionExecuteStep(options?.setConnectionForDeploy));
        }

        if (!hasValidEventHubName) {
            promptSteps.push(new NetheriteEventHubNameStep());
        }

        executeSteps.push(new NetheriteConfigureHostStep());

        const wizard: AzureWizard<IEventHubsConnectionWizardContext> = new AzureWizard(wizardContext, {
            promptSteps,
            executeSteps
        });

        await wizard.prompt();
        await wizard.execute();
    }

    export function getDefaultNetheriteTaskConfig(hubName?: string): INetheriteTaskJson {
        return {
            hubName: hubName || defaultNetheriteHubName,
            useGracefulShutdown: true,
            storageProvider: {
                type: DurableBackend.Netherite,
                partitionCount: 12,
                StorageConnectionName: ConnectionKey.Storage,
                EventHubsConnectionName: ConnectionKey.EventHub,
            }
        };
    }
}

export namespace sqlUtils {
    export async function validateConnection(context: IActionContext, options?: Omit<IValidateConnectionOptions, 'suppressSkipForNow'>, projectPath?: string): Promise<void> {
        projectPath ??= getWorkspaceRootPath();
        if (!projectPath) {
            throw new Error(emptyWorkspace);
        }

        const sqlDbConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.SQL, projectPath);
        const hasSqlDbConnection: boolean = !!sqlDbConnection;

        if (hasSqlDbConnection) {
            if (options?.setConnectionForDeploy) {
                Object.assign(context, { sqlDbConnectionForDeploy: sqlDbConnection });
                return;
            }
        }

        const wizardContext: ISqlDatabaseConnectionWizardContext = Object.assign(context, { projectPath });
        const wizard: AzureWizard<IEventHubsConnectionWizardContext> = new AzureWizard(wizardContext, {
            promptSteps: [new SqlDatabaseConnectionPromptStep({ preSelectedConnectionType: options?.preSelectedConnectionType, suppressSkipForNow: true }), new SqlDatabaseListStep()],
            executeSteps: [new SqlDatabaseConnectionExecuteStep(options?.setConnectionForDeploy)]
        });
        await wizard.prompt();
        await wizard.execute();
    }

    export function getDefaultSqlTaskConfig(): ISqlTaskJson {
        return {
            storageProvider: {
                type: DurableBackend.SQL,
                connectionStringName: ConnectionKey.SQL,
                taskEventLockTimeout: "00:02:00",
                createDatabaseIfNotExists: true,
                schemaName: null
            }
        };
    }
}
