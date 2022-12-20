/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, IActionContext, IParsedError, parseError } from "@microsoft/vscode-azext-utils";
import * as path from "path";
import { Uri } from "vscode";
import * as xml2js from "xml2js";
import { EventHubsConnectionExecuteStep } from "../commands/appSettings/connectionSettings/eventHubs/EventHubsConnectionExecuteStep";
import { EventHubsConnectionPromptStep } from "../commands/appSettings/connectionSettings/eventHubs/EventHubsConnectionPromptStep";
import { IEventHubsConnectionWizardContext } from "../commands/appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext";
import { IValidateConnectionOptions } from "../commands/appSettings/connectionSettings/IConnectionPromptOptions";
import { ISqlDatabaseConnectionWizardContext } from "../commands/appSettings/connectionSettings/sqlDatabase/ISqlDatabaseConnectionWizardContext";
import { SqlDatabaseConnectionExecuteStep } from "../commands/appSettings/connectionSettings/sqlDatabase/SqlDatabaseConnectionExecuteStep";
import { SqlDatabaseConnectionPromptStep } from "../commands/appSettings/connectionSettings/sqlDatabase/SqlDatabaseConnectionPromptStep";
import { NetheriteConfigureHostStep } from "../commands/createFunction/durableSteps/netherite/NetheriteConfigureHostStep";
import { NetheriteEventHubNameStep } from "../commands/createFunction/durableSteps/netherite/NetheriteEventHubNameStep";
import { SqlDatabaseListStep } from "../commands/createFunction/durableSteps/sql/SqlDatabaseListStep";
import { IFunctionWizardContext } from "../commands/createFunction/IFunctionWizardContext";
import { ConnectionKey, DurableBackend, DurableBackendValues, hostFileName, localEventHubsEmulatorConnectionRegExp, ProjectLanguage, requirementsFileName } from "../constants";
import { ext } from "../extensionVariables";
import { IHostJsonV2, INetheriteTaskJson, ISqlTaskJson, IStorageTaskJson } from "../funcConfig/host";
import { getLocalConnectionString } from "../funcConfig/local.settings";
import { localize } from "../localize";
import { cpUtils } from "./cpUtils";
import { pythonUtils } from "./pythonUtils";
import { venvUtils } from "./venvUtils";
import { findFiles } from "./workspace";

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

    export async function getStorageTypeFromWorkspace(language: string | undefined, projectPath: string): Promise<DurableBackendValues | undefined> {
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
    }

    // #region Verify Durable Dependencies

    // Use workspace dependencies as an indicator to check whether the project already has durable storage setup
    export async function verifyHasDurableStorage(language: string | undefined, projectPath: string): Promise<boolean> {
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

        const packageJson: Record<string, unknown> = await AzExtFsExtra.readJSON(packagePath);
        const dependencies = packageJson?.dependencies as {} || {};
        return !!dependencies[nodeDfPackage];
    }

    async function dotnetProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        const csProjPaths: Uri[] = await findFiles(projectPath, '*.csproj');
        if (!(csProjPaths?.[0]?.path && await AzExtFsExtra.pathExists(csProjPaths[0].path))) {
            return false;
        }

        const csProjContents: string = await AzExtFsExtra.readFile(csProjPaths[0].path);

        return new Promise((resolve) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            xml2js.parseString(csProjContents, { explicitArray: false }, (err: any, result: any): void => {
                if (result && !err) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
                    let packageReferences = result?.['Project']?.['ItemGroup']?.[0]?.PackageReference ?? [];
                    packageReferences = (packageReferences instanceof Array) ? packageReferences : [packageReferences];

                    for (const packageRef of packageReferences) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        if (packageRef['$'] && packageRef['$']['Include']) {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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

    // #endregion Verify Durable Dependencies

    // #region Install Durable Dependencies

    export async function tryInstallDurableDependencies(context: IFunctionWizardContext): Promise<void> {
        switch (context.language) {
            case ProjectLanguage.Java:
                // Todo: Revisit when adding Java implementation
                break;
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                await installDotnetDependencies(context);
                break;
            case ProjectLanguage.JavaScript:
            case ProjectLanguage.TypeScript:
                await installNodeDependencies(context);
                break;
            case ProjectLanguage.Python:
                await pythonUtils.addDependencyToRequirements(durableUtils.pythonDfPackage, context.projectPath);
                await venvUtils.runPipInstallCommandIfPossible(context.projectPath);
                break;
            case ProjectLanguage.PowerShell:
                // Todo: Revisit when adding PowerShell implementation
                break;
            default:
        }
    }

    async function installDotnetDependencies(context: IFunctionWizardContext): Promise<void> {
        const packageNames: string[] = [];
        switch (context.newDurableStorageType) {
            case DurableBackend.Netherite:
                packageNames.push(durableUtils.dotnetDfNetheritePackage);
                break;
            case DurableBackend.SQL:
                packageNames.push(durableUtils.dotnetDfSqlPackage);
                break;
            case DurableBackend.Storage:
            default:
        }

        // Seems that the package arrives out-dated and needs to be updated
        packageNames.push(durableUtils.dotnetDfBasePackage);

        const failedPackages: string[] = [];
        for (const packageName of packageNames) {
            try {
                await cpUtils.executeCommand(ext.outputChannel, context.projectPath, 'dotnet', 'add', 'package', packageName);
            } catch {
                failedPackages.push(packageName);
            }
        }

        if (failedPackages.length) {
            ext.outputChannel.appendLog(localize('durableDependencyInstallFailed', 'WARNING: Failed to install and update Durable Functions NuGet packages to the root .csproj project file. You may need to install the following packages manually: "{0}".', failedPackages.join('", "')));
        }
    }

    async function installNodeDependencies(context: IFunctionWizardContext): Promise<void> {
        try {
            await cpUtils.executeCommand(ext.outputChannel, context.projectPath, 'npm', 'install', durableUtils.nodeDfPackage);
        } catch (error) {
            const pError: IParsedError = parseError(error);
            const dfDepInstallFailed: string = localize('failedToAddDurableNodeDependency', 'Failed to add or install the "{0}" dependency. Please inspect and verify if it needs to be added manually.', durableUtils.nodeDfPackage);
            ext.outputChannel.appendLog(pError.message);
            ext.outputChannel.appendLog(dfDepInstallFailed);
        }
    }

    // #endregion Install Durable Dependencies

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

    export async function getEventHubName(projectPath: string): Promise<string | undefined> {
        const hostJsonPath = path.join(projectPath, hostFileName);
        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            return undefined;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath);
        const taskJson: INetheriteTaskJson = hostJson.extensions?.durableTask as INetheriteTaskJson;
        return taskJson?.hubName;
    }

    export async function validateConnection(context: IActionContext, projectPath: string, options?: IValidateConnectionOptions): Promise<void> {
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
            promptSteps.push(new EventHubsConnectionPromptStep({ preselectedConnectionType: options?.preselectedConnectionType }));
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
    export async function validateConnection(context: IActionContext, projectPath: string, options?: IValidateConnectionOptions): Promise<void> {
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
            promptSteps: [new SqlDatabaseConnectionPromptStep({ preselectedConnectionType: options?.preselectedConnectionType }), new SqlDatabaseListStep()],
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
