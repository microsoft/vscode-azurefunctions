/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, IParsedError, parseError } from "@microsoft/vscode-azext-utils";
// eslint-disable-next-line @typescript-eslint/import/no-internal-modules
import * as g2js from 'gradle-to-js/lib/parser';
import * as path from "path";
import { env, MessageItem, Uri, window } from "vscode";
import * as xml2js from "xml2js";
import { EventHubsConnectionExecuteStep } from "../commands/appSettings/connectionSettings/eventHubs/EventHubsConnectionExecuteStep";
import { EventHubsConnectionPromptStep } from "../commands/appSettings/connectionSettings/eventHubs/EventHubsConnectionPromptStep";
import { IEventHubsConnectionWizardContext } from "../commands/appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext";
import { IConnectionPromptOptions } from "../commands/appSettings/connectionSettings/IConnectionPromptOptions";
import { ISetConnectionSettingContext } from "../commands/appSettings/connectionSettings/ISetConnectionSettingContext";
import { ISqlDatabaseConnectionWizardContext } from "../commands/appSettings/connectionSettings/sqlDatabase/ISqlDatabaseConnectionWizardContext";
import { SqlDatabaseConnectionExecuteStep } from "../commands/appSettings/connectionSettings/sqlDatabase/SqlDatabaseConnectionExecuteStep";
import { SqlDatabaseConnectionPromptStep } from "../commands/appSettings/connectionSettings/sqlDatabase/SqlDatabaseConnectionPromptStep";
import { NetheriteConfigureHostStep } from "../commands/createFunction/durableSteps/netherite/NetheriteConfigureHostStep";
import { NetheriteEventHubNameStep } from "../commands/createFunction/durableSteps/netherite/NetheriteEventHubNameStep";
import { SqlDatabaseListStep } from "../commands/createFunction/durableSteps/sql/SqlDatabaseListStep";
import { IFunctionWizardContext } from "../commands/createFunction/IFunctionWizardContext";
import { buildGradleFileName, CodeAction, ConnectionKey, DurableBackend, DurableBackendValues, hostFileName, JavaBuildTool, JavaBuildToolValues, localEventHubsEmulatorConnectionRegExp, pomXmlFileName, ProjectLanguage, requirementsFileName } from "../constants";
import { ext } from "../extensionVariables";
import { IHostJsonV2, INetheriteTaskJson, ISqlTaskJson, IStorageTaskJson } from "../funcConfig/host";
import { getLocalSettingsConnectionString } from "../funcConfig/local.settings";
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
    export const gradleDfPackage: string = 'com.microsoft:durabletask-azure-functions';
    export const mavenDfPackage = {
        groupId: 'com.microsoft',
        artifactId: 'durabletask-azure-functions',
        version: '1.0.0'  // Placeholder
    };

    export function requiresDurableStorage(templateId: string, language?: string): boolean {
        // Todo: Remove when Powershell implementation is added
        if (language === ProjectLanguage.PowerShell) {
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
                const javaBuildTool: JavaBuildToolValues | undefined = await getJavaBuildTool(projectPath);
                if (javaBuildTool === JavaBuildTool.gradle) {
                    return await gradleProjectHasDurableDependency(projectPath);
                } else if (javaBuildTool === JavaBuildTool.maven) {
                    return await mavenProjectHasDurableDependency(projectPath);
                }
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
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                    resolve(packageReferences.some(p => p?.['$']?.['Include'] === dotnetDfBasePackage));
                }
            });
        });
    }

    async function pythonProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        const requirementsPath: string = path.join(projectPath, requirementsFileName);
        return await pythonUtils.hasDependencyInRequirements(pythonDfPackage, requirementsPath);
    }

    async function gradleProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        const gradleBuildPath: string = path.join(projectPath, buildGradleFileName);
        const dependencies = (await g2js.parseFile(gradleBuildPath)).dependencies;
        return dependencies.some(d => `${d.group}:${d.name}` === gradleDfPackage);
    }

    async function mavenProjectHasDurableDependency(projectPath: string): Promise<boolean> {
        const pomXmlPath: string = path.join(projectPath, pomXmlFileName);
        const pomXmlContents: string = await AzExtFsExtra.readFile(pomXmlPath);

        return new Promise((resolve) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            xml2js.parseString(pomXmlContents, { explicitArray: false }, (err: any, result: any): void => {
                if (result && !err) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
                    let dependencies = result?.project?.dependencies?.dependency ?? [];
                    // Todo: test when empty dependency xml
                    resolve(dependencies.some(d => d.artifactId === mavenDfPackage.artifactId));
                }
            });
        });
    }

    // #endregion Verify Durable Dependencies

    // #region Install Durable Dependencies

    export async function tryInstallDurableDependencies(context: IFunctionWizardContext): Promise<void> {
        switch (context.language) {
            case ProjectLanguage.Java:
                const javaBuildTool: JavaBuildToolValues | undefined = await getJavaBuildTool(context.projectPath);
                if (javaBuildTool === JavaBuildTool.gradle) {
                    await installGradleDependencies(context.projectPath);
                } else if (javaBuildTool === JavaBuildTool.maven) {
                    await installMavenDependencies(context.projectPath);
                }
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

    async function getJavaBuildTool(projectPath: string): Promise<JavaBuildToolValues | undefined> {
        const hasGradleBuild: boolean = await AzExtFsExtra.pathExists(path.join(projectPath, buildGradleFileName));
        const hasPomXml: boolean = await AzExtFsExtra.pathExists(path.join(projectPath, pomXmlFileName));
        if (hasGradleBuild) {
            return JavaBuildTool.gradle;
        } else if (hasPomXml) {
            return JavaBuildTool.maven;
        } else {
            return undefined;
        }
    }

    async function installGradleDependencies(_projectPath: string): Promise<void> {
        // Gradle
    }

    async function installMavenDependencies(_projectPath: string): Promise<void> {
        /*
         * Parsing and rebuilding the xml with xml2js doesn't preserve certain things like comments.
         * We can explore migrating to a different xml parser in the future for this.
         * In the mean time, expect that the user will have to add the dependency themselves
         * (it's recommended to the user via the durable orchestration comments anyway)
         *
         * We will try to make it easier for the user by providing an option to copy the dependency.
         */
        const renderOpts: xml2js.RenderOptions = { pretty: true, indent: '    ', newline: '\n' };
        const builder = new xml2js.Builder({ renderOpts, headless: true });

        const xml: string = builder.buildObject({ dependency: mavenDfPackage });
        const xmlWithComment: string = `<!-- ${localize('upgradeVersion', 'Upgrade to latest version')} -->\n` + xml;

        const copyCommand: MessageItem = { title: localize('copyCommand', 'Copy dependency') };
        const message: string = localize('installMavenDfDep', 'Add "{0}" dependency to "{1}"', `${mavenDfPackage.groupId}:${mavenDfPackage.artifactId}`, pomXmlFileName);
        void window.showInformationMessage<MessageItem>(message, copyCommand).then(async (result) => {
            if (result === copyCommand) {
                await env.clipboard.writeText(xmlWithComment);
                ext.outputChannel.appendLog(localize('copiedClipboard', 'Copied to clipboard:\n{0}', xmlWithComment));
            }
        });
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
    export async function getEventHubName(projectPath: string): Promise<string | undefined> {
        const hostJsonPath = path.join(projectPath, hostFileName);
        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            return undefined;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath);
        const taskJson: INetheriteTaskJson = hostJson.extensions?.durableTask as INetheriteTaskJson;
        return taskJson?.hubName;
    }

    // Supports validation on both 'debug' and 'deploy'
    export async function validateConnection(context: Omit<ISetConnectionSettingContext, 'projectPath'>, projectPath: string, options?: IConnectionPromptOptions): Promise<void> {
        const eventHubsConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.EventHubs, projectPath);
        const eventHubName: string | undefined = await getEventHubName(projectPath);

        if (!!eventHubsConnection && !!eventHubName) {
            if (context.action === CodeAction.Deploy) {
                if (!localEventHubsEmulatorConnectionRegExp.test(eventHubsConnection)) {
                    // Found a valid connection in deploy mode. Set it and skip the wizard.
                    context[ConnectionKey.EventHubs] = eventHubsConnection;
                    return;
                }
                // Found an invalid connection for deploy mode, we need to proceed with acquiring a connection through the wizard...
            } else {
                // Found a valid connection in debug mode.  Skip the wizard.
                return;
            }
        }

        const wizardContext: IEventHubsConnectionWizardContext = Object.assign(context, { projectPath });
        const promptSteps: AzureWizardPromptStep<IEventHubsConnectionWizardContext>[] = [];
        const executeSteps: AzureWizardExecuteStep<IEventHubsConnectionWizardContext>[] = [];

        if (!eventHubsConnection) {
            promptSteps.push(new EventHubsConnectionPromptStep(options));
            executeSteps.push(new EventHubsConnectionExecuteStep());
        }

        if (!eventHubName) {
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
            hubName: hubName || '',
            useGracefulShutdown: true,
            storageProvider: {
                type: DurableBackend.Netherite,
                partitionCount: 12,
                StorageConnectionName: ConnectionKey.Storage,
                EventHubsConnectionName: ConnectionKey.EventHubs,
            }
        };
    }
}

export namespace sqlUtils {
    // Supports validation on both 'debug' and 'deploy'
    export async function validateConnection(context: Omit<ISetConnectionSettingContext, 'projectPath'>, projectPath: string, options?: IConnectionPromptOptions): Promise<void> {
        const sqlDbConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.SQL, projectPath);

        if (sqlDbConnection) {
            if (context.action === CodeAction.Deploy) {
                // Found a valid connection in deploy mode. Set it for deploy.
                context[ConnectionKey.SQL] = sqlDbConnection;
            }
            // Found a valid connection in debug or deploy mode. Skip the wizard.
            return;
        }

        const wizardContext: ISqlDatabaseConnectionWizardContext = Object.assign(context, { projectPath });
        const wizard: AzureWizard<IEventHubsConnectionWizardContext> = new AzureWizard(wizardContext, {
            promptSteps: [new SqlDatabaseConnectionPromptStep(options), new SqlDatabaseListStep()],
            executeSteps: [new SqlDatabaseConnectionExecuteStep()]
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
