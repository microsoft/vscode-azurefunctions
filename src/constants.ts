/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
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
export const showBallerinaProjectCreationSetting: string = 'showBallerinaProjectCreation';
export const mcpProjectTypeSetting: string = 'mcpProjectType';

export const browseItem: IAzureQuickPickItem<undefined> = { label: localize('browse', '$(file-directory) Browse...'), description: '', data: undefined };

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
    Custom = 'Custom',
    SelfHostedMCPServer = 'SelfHostedMCPServer'
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
    Debug = 'Debug',
}

/**
 * Default host connection keys
 */
export enum ConnectionKey {
    Storage = 'AzureWebJobsStorage',
    StorageIdentity = 'AzureWebJobsStorage__accountName',
    EventHubs = 'EventHubsConnection',
    DTS = 'DURABLE_TASK_SCHEDULER_CONNECTION_STRING',
    DTSHub = '%TASKHUB_NAME%',
    SQL = 'SQLDB_Connection',
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
     * Represents the connection to any resource that the user provides through a manually entered connection string
     */
    Custom = 'Custom',
}

export enum DurableBackend {
    Storage = 'AzureStorage',
    Netherite = 'Netherite',
    DTS = 'azureManaged',
    SQL = 'mssql',
}

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

// standard Azurite emulator account key
export const azuriteAccountKey: string = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq';
export const localStorageEmulatorConnectionString: string = 'UseDevelopmentStorage=true';
export const localEventHubsEmulatorConnectionString: string = 'SingleHost';
export const localEventHubsEmulatorConnectionRegExp: RegExp = new RegExp(`${localEventHubsEmulatorConnectionString}|MemoryF|Memory`);

export const workerRuntimeKey: string = 'FUNCTIONS_WORKER_RUNTIME';
export const workerRuntimeVersionKey: string = 'FUNCTIONS_WORKER_RUNTIME_VERSION';
export const extensionVersionKey: string = 'FUNCTIONS_EXTENSION_VERSION';
export const runFromPackageKey: string = 'WEBSITE_RUN_FROM_PACKAGE';
export const contentConnectionStringKey: string = 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING';
export const contentShareKey: string = 'WEBSITE_CONTENTSHARE';
export const azureWebJobsFeatureFlags: string = 'AzureWebJobsFeatureFlags';
export const enableMcpCustomHandlerPreview: string = 'EnableMcpCustomHandlerPreview';
export const mcpSelfHostedConfigurationProfile: string = 'mcp-custom-handler';

/**
 * The "current" Node.js model is 3 (and assumed, if the number is omitted).
 * The new Node.js model is 4.
 * Any significantly changed new model should use an incremented number.
 */
export const nodeDefaultModelVersion: number = 4;
const nodeDefaultModel: IAzureQuickPickItem<number | undefined> = { data: nodeDefaultModelVersion, label: localize('modelV4', 'Model V4') };
const nodeV3Model: IAzureQuickPickItem<number | undefined> = { data: undefined, label: localize('modelV3', 'Model V3') }

export const nodeModels = [nodeDefaultModel, nodeV3Model];
export const nodeLearnMoreLink = 'https://aka.ms/AzFuncNodeV4';

export const pythonDefaultModelVersion: number = 2;
const pythonV2Model: IAzureQuickPickItem<number | undefined> = { data: pythonDefaultModelVersion, label: localize('pyModelV2', 'Model V2') };
const pythonV1Model: IAzureQuickPickItem<number | undefined> = { data: undefined, label: localize('pyModelV1', 'Model V1') }

export const pythonModels = [pythonV2Model, pythonV1Model];
export const pythonLearnMoreLink = 'https://aka.ms/AAmlyrc';
export const stackUpgradeLearnMoreLink = 'https://aka.ms/FunctionsStackUpgrade';

export const webProvider: string = 'Microsoft.Web';
export const functionFilter = {
    type: 'microsoft.web/sites',
    kind: 'functionapp',
};

export const sqlBindingTemplateRegex: RegExp = /Sql.*Binding/i;

/** @link https://github.com/Azure/azure-functions-templates/tree/dev/Docs/Actions */
export enum ActionType {
    AppendToFile = "AppendToFile",
    // never actually have seen this step, but it's in the schema
    ReplaceTokensInText = "ReplaceTokensInText",
    ShowMarkdownPreview = "ShowMarkdownPreview",
    WriteToFile = "WriteToFile",
    GetTemplateFileContent = "GetTemplateFileContent"
}
export const noRuntimeStacksAvailableLabel = localize('noRuntimeStacksAvailable', 'No valid runtime stacks available');

export enum EventGridExecuteFunctionEntryPoint {
    CodeLens = 'CodeLens',
    TitleBarButton = 'TitleBarButton'
}

// Originally from the Docker extension: https://github.com/microsoft/vscode-docker/blob/main/src/constants.ts
export const dockerfileGlobPattern = '{*.[dD][oO][cC][kK][eE][rR][fF][iI][lL][eE],[dD][oO][cC][kK][eE][rR][fF][iI][lL][eE],[dD][oO][cC][kK][eE][rR][fF][iI][lL][eE].*}';

export const StorageProvider: string = 'Microsoft.Storage';
export const StorageAccountsResourceType: string = 'storageAccounts';

export const SqlProvider: string = 'Microsoft.Sql';
export const SqlServerResourceType: string = 'servers';

export const EventHubsProvider: string = 'Microsoft.EventHub';
export const EventHubsNamespaceResourceType: string = 'namespaces';

export const DurableTaskProvider: string = 'Microsoft.DurableTask';
export const DurableTaskSchedulersResourceType: string = 'schedulers';
export type GitHubFileMetadata = {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string;
    type: string;
    _links: {
        self: string;
        git: string;
        html: string;
    };
};

export enum McpProjectType {
    McpExtensionServer = 'McpExtensionServer',
    SelfHostedMcpServer = 'SelfHostedMcpServer'
}
