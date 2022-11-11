/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";
import * as path from "path";
import { Uri } from "vscode";
import * as xml2js from "xml2js";
import { ConnectionKey, DurableBackend, DurableBackendValues, hostFileName, ProjectLanguage, requirementsFileName } from "../constants";
import { NoWorkspaceError } from "../errors";
import { IHostJsonV2, INetheriteTaskJson, ISqlTaskJson, IStorageTaskJson } from "../funcConfig/host";
import { pythonUtils } from "./pythonUtils";
import { findFiles, getRootWorkspacePath } from "./workspace";

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

    export async function getStorageTypeFromWorkspace(language: string | undefined, projectPath?: string): Promise<DurableBackendValues | undefined> {
        projectPath ??= await getRootWorkspacePath();
        if (!projectPath) {
            return undefined;
        }

        const hasDurableStorage: boolean = await verifyHasDurableStorage(language, projectPath);
        if (!hasDurableStorage) {
            return undefined;
        }

        const hostJsonPath = path.join(projectPath, hostFileName);
        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            return undefined;
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
    // Use workspace dependencies as an indicator to check whether the project already has durable storage setup
    export async function verifyHasDurableStorage(language: string | undefined, projectPath?: string): Promise<boolean> {
        projectPath ??= await getRootWorkspacePath();
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
        if (!await AzExtFsExtra.pathExists(packagePath)) {
            return false;
        }

        const packageJson: Record<string, any> = await AzExtFsExtra.readJSON(packagePath);
        const dependencies = packageJson.dependencies || {};
        return !!dependencies[nodeDfPackage];
    }

    async function dotnetProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        const csProjPaths: Uri[] = await findFiles(projectPath, '*.csproj');
        if (!(csProjPaths?.[0]?.path && AzExtFsExtra.pathExists(csProjPaths[0].path))) {
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
        const requirementsPath: string = path.join(projectPath, requirementsFileName);
        return await pythonUtils.hasDependencyInRequirements(pythonDfPackage, requirementsPath);
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
        projectPath ??= await getRootWorkspacePath();
        if (!projectPath) {
            throw new NoWorkspaceError();
        }

        const hostJsonPath = path.join(projectPath, hostFileName);
        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            return undefined;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath);
        const taskJson: INetheriteTaskJson = hostJson.extensions?.durableTask as INetheriteTaskJson;
        return taskJson?.hubName;
    }

    // Todo: Uncomment out in future PR
    // export async function validateConnection(context: IActionContext, options?: Omit<IValidateConnectionOptions, 'suppressSkipForNow'>, projectPath?: string): Promise<void> {
    //     projectPath ??= await getRootWorkspacePath();
    //     if (!projectPath) {
    //         throw new NoWorkspaceError();
    //     }

    //     const eventHubsConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.EventHub, projectPath);
    //     const hasEventHubsConnection: boolean = !!eventHubsConnection && !localEventHubsEmulatorConnectionRegExp.test(eventHubsConnection);

    //     const eventHubName: string | undefined = await getEventHubName(projectPath);
    //     const hasValidEventHubName: boolean = !!eventHubName && eventHubName !== netheriteUtils.defaultNetheriteHubName;

    //     const wizardContext: IEventHubsConnectionWizardContext = Object.assign(context, { projectPath });
    //     const promptSteps: AzureWizardPromptStep<IEventHubsConnectionWizardContext>[] = [];
    //     const executeSteps: AzureWizardExecuteStep<IEventHubsConnectionWizardContext>[] = [];

    //     if (hasEventHubsConnection && hasValidEventHubName && options?.setConnectionForDeploy) {
    //         Object.assign(context, { eventHubConnectionForDeploy: eventHubsConnection });
    //     } else {
    //         promptSteps.push(new EventHubsConnectionPromptStep({ preSelectedConnectionType: options?.preSelectedConnectionType, suppressSkipForNow: true }));
    //         executeSteps.push(new EventHubsConnectionExecuteStep(options?.setConnectionForDeploy));
    //     }

    //     if (!hasValidEventHubName) {
    //         promptSteps.push(new NetheriteEventHubNameStep());
    //     }

    //     executeSteps.push(new NetheriteConfigureHostStep());

    //     const wizard: AzureWizard<IEventHubsConnectionWizardContext> = new AzureWizard(wizardContext, {
    //         promptSteps,
    //         executeSteps
    //     });

    //     await wizard.prompt();
    //     await wizard.execute();
    // }

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
    // Todo: Uncomment out in future PR
    // export async function validateConnection(context: IActionContext, options?: Omit<IValidateConnectionOptions, 'suppressSkipForNow'>, projectPath?: string): Promise<void> {
    //     projectPath ??= await getRootWorkspacePath();
    //     if (!projectPath) {
    //         throw new NoWorkspaceError();
    //     }

    //     const sqlDbConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.SQL, projectPath);
    //     const hasSqlDbConnection: boolean = !!sqlDbConnection;

    //     if (hasSqlDbConnection) {
    //         if (options?.setConnectionForDeploy) {
    //             Object.assign(context, { sqlDbConnectionForDeploy: sqlDbConnection });
    //             return;
    //         }
    //     }

    //     const wizardContext: ISqlDatabaseConnectionWizardContext = Object.assign(context, { projectPath });
    //     const wizard: AzureWizard<IEventHubsConnectionWizardContext> = new AzureWizard(wizardContext, {
    //         promptSteps: [new SqlDatabaseConnectionPromptStep({ preSelectedConnectionType: options?.preSelectedConnectionType, suppressSkipForNow: true }), new SqlDatabaseListStep()],
    //         executeSteps: [new SqlDatabaseConnectionExecuteStep(options?.setConnectionForDeploy)]
    //     });
    //     await wizard.prompt();
    //     await wizard.execute();
    // }

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
