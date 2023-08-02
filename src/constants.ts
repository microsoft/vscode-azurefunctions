/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "./localize";

export const extensionId: string = 'ms-azuretools.vscode-azurefunctions';
export const projectLanguageSetting: string = 'projectLanguage';
export const projectLanguageModelSetting: string = 'projectLanguageModel';
export const funcVersionSetting: string = 'projectRuntime'; // Using this name for the sake of backwards compatability even though it's not the most accurate
export const projectSubpathSetting: string = 'projectSubpath';
export const templateFilterSetting: string = 'templateFilter';
export const deploySubpathSetting: string = 'deploySubpath';
export const templateVersionSetting: string = 'templateVersion';
export const preDeployTaskSetting: string = 'preDeployTask';
export const pythonVenvSetting: string = 'pythonVenv';
export const projectOpenBehaviorSetting: string = 'projectOpenBehavior';
export const hiddenStacksSetting: string = 'showHiddenStacks';
export const projectTemplateKeySetting: string = 'projectTemplateKey';
export const remoteBuildSetting: string = 'scmDoBuildDuringDeployment';
export const javaBuildTool: string = 'javaBuildTool';
export const functionSubpathSetting: string = 'functionSubpath';

export enum ProjectLanguage {
    CSharp = 'C#',
    CSharpScript = 'C#Script',
    FSharp = 'F#',
    FSharpScript = 'F#Script',
    Java = 'Java',
    JavaScript = 'JavaScript',
    PowerShell = 'PowerShell',
    Python = 'Python',
    TypeScript = 'TypeScript',
    Ballerina = 'Ballerina',
    Custom = 'Custom'
}

/**
 * The "original" (i.e. first) Python model is 1 (and assumed, if the number is omitted).
 * The new (i.e. second) Python model (i.e. with binding attributes, now in Preview) is 2.
 * Any significantly changed new model should use an incremented number.
 */
export const previewPythonModel: number = 2;

export enum TemplateFilter {
    All = 'All',
    Core = 'Core',
    Verified = 'Verified'
}

export const hostFileName: string = 'host.json';
export const localSettingsFileName: string = 'local.settings.json';
export const functionJsonFileName: string = 'function.json';
export const tasksFileName: string = 'tasks.json';
export const launchFileName: string = 'launch.json';
export const settingsFileName: string = 'settings.json';
export const vscodeFolderName: string = '.vscode';
export const gitignoreFileName: string = '.gitignore';
export const packageJsonFileName: string = 'package.json';
export const requirementsFileName: string = 'requirements.txt';
export const pythonFunctionAppFileName: string = 'function_app.py';
export const pythonFunctionBodyFileName: string = 'function_body.py';
export const extensionsCsprojFileName: string = 'extensions.csproj';
export const pomXmlFileName: string = 'pom.xml';
export const buildGradleFileName: string = 'build.gradle';
export const settingsGradleFileName: string = 'settings.gradle';
export enum JavaBuildTool {
    maven = 'maven',
    gradle = 'gradle'
}

export const ballerinaTomlFileName: string = "Ballerina.toml"
export enum BallerinaBackend {
    jvm = 'jvm',
    native = 'native'
}

export enum PackageManager {
    npm = 'npm',
    brew = 'brew'
}

export const funcPackageName: string = 'azure-functions-core-tools';

export enum ScmType {
    None = 'None', // default scmType
    LocalGit = 'LocalGit',
    GitHub = 'GitHub'
}

export enum CodeAction {
    Deploy = 'Deploy',
    Debug = 'Debug'
}

export enum ConnectionKey {
    Storage = 'AzureWebJobsStorage',
    EventHubs = 'EventHubsConnection',
    SQL = 'SQLDB_Connection'
}

export enum ConnectionType {
    /**
     * Represents the connection to any resource that is hosted through Azure
     */
    Azure = "Azure",
    /**
     * Represents the connection to a local emulator resource
     */
    Emulator = 'Emulator',
    /**
     * Represents the connection to any resource that the user provides through a direct connection string
     */
    Custom = 'Custom',
}

export enum DurableBackend {
    Storage = 'AzureStorage',
    Netherite = 'Netherite',
    SQL = "mssql"
}

export type ConnectionTypeValues = typeof ConnectionType[keyof typeof ConnectionType];
export type StorageConnectionTypeValues = Exclude<ConnectionTypeValues, ConnectionType.Custom>;
export type EventHubsConnectionTypeValues = Exclude<ConnectionTypeValues, ConnectionType.Custom>;
export type SqlDbConnectionTypeValues = Exclude<ConnectionTypeValues, ConnectionType.Emulator>;

export type CodeActionValues = typeof CodeAction[keyof typeof CodeAction];
export type ConnectionKeyValues = typeof ConnectionKey[keyof typeof ConnectionKey];
export type DurableBackendValues = typeof DurableBackend[keyof typeof DurableBackend];

export const func: string = 'func';
export const extInstallCommand: string = 'extensions install';
export const extInstallTaskName: string = `${func}: ${extInstallCommand}`;

export const hostStartCommand: string = 'host start';
export const hostStartTaskName: string = `${func}: ${hostStartCommand}`;
export const hostStartTaskNameRegExp = new RegExp(hostStartTaskName, 'i');

export const packCommand: string = 'pack';
export const buildNativeDeps: string = '--build-native-deps';
export const packTaskName: string = `${func}: ${packCommand}`;

export const localhost: string = '127.0.0.1';

export const tsDefaultOutDir: string = 'dist';
export const tsConfigFileName: string = 'tsconfig.json';

export const localEventHubsEmulatorConnectionStringDefault: string = 'MemoryF';
export const localEventHubsEmulatorConnectionStringAlternate: string = 'Memory';

export const localStorageEmulatorConnectionString: string = 'UseDevelopmentStorage=true';
export const localEventHubsEmulatorConnectionRegExp: RegExp = new RegExp(`${localEventHubsEmulatorConnectionStringDefault}|${localEventHubsEmulatorConnectionStringAlternate}`);

export const workerRuntimeKey: string = 'FUNCTIONS_WORKER_RUNTIME';
export const workerRuntimeVersionKey: string = 'FUNCTIONS_WORKER_RUNTIME_VERSION';
export const extensionVersionKey: string = 'FUNCTIONS_EXTENSION_VERSION';
export const runFromPackageKey: string = 'WEBSITE_RUN_FROM_PACKAGE';
export const contentConnectionStringKey: string = 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING';
export const contentShareKey: string = 'WEBSITE_CONTENTSHARE';
export const azureWebJobsFeatureFlags: string = 'AzureWebJobsFeatureFlags';

/**
 * The "current" Node.js model is 3 (and assumed, if the number is omitted).
 * The new Node.js model is 4.
 * Any significantly changed new model should use an incremented number.
 */
export const nodeV4ModelVersion: number = 4;
export const nodeV4Model: { modelVersion: number, label: string } = { modelVersion: nodeV4ModelVersion, label: localize('modelV4', 'Model V4 (Preview)') };
export const nodeDefaultModel: { modelVersion: undefined, label: string } = { modelVersion: undefined, label: localize('modelV3', 'Model V3') }

export const nodeModels = [nodeDefaultModel, nodeV4Model];
export const nodeLearnMoreLink = 'https://aka.ms/AzFuncNodeV4';

export const webProvider: string = 'Microsoft.Web';
export const functionFilter = {
    type: 'microsoft.web/sites',
    kind: 'functionapp',
};

export const sqlBindingTemplateRegex: RegExp = /Sql.*Binding/i;
export const noRuntimeStacksAvailableLabel = localize('noRuntimeStacksAvailable', 'No valid runtime stacks available');
