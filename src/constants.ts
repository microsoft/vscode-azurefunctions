/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "./localize";

export const projectLanguageSetting: string = 'projectLanguage';
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
    Custom = 'Custom'
}

export enum TemplateFilter {
    All = 'All',
    Core = 'Core',
    Verified = 'Verified'
}

export const hostFileName: string = 'host.json';
export const localSettingsFileName: string = 'local.settings.json';
export const functionJsonFileName: string = 'function.json';
export const proxiesFileName: string = 'proxies.json';
export const tasksFileName: string = 'tasks.json';
export const launchFileName: string = 'launch.json';
export const settingsFileName: string = 'settings.json';
export const vscodeFolderName: string = '.vscode';
export const gitignoreFileName: string = '.gitignore';
export const requirementsFileName: string = 'requirements.txt';
export const extensionsCsprojFileName: string = 'extensions.csproj';
export const pomXmlFileName: string = 'pom.xml';
export const buildGradleFileName: string = 'build.gradle';
export enum JavaBuildTool {
    maven = 'maven',
    gradle = 'gradle'
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

export const func: string = 'func';
export const extInstallCommand: string = 'extensions install';
export const extInstallTaskName: string = `${func}: ${extInstallCommand}`;

export const hostStartCommand: string = 'host start';
export const hostStartTaskName: string = `${func}: ${hostStartCommand}`;

export const packCommand: string = 'pack';
export const buildNativeDeps: string = '--build-native-deps';
export const packTaskName: string = `${func}: ${packCommand}`;

export const localhost: string = '127.0.0.1';

export const tsDefaultOutDir: string = 'dist';
export const tsConfigFileName: string = 'tsconfig.json';

export const localEmulatorConnectionString: string = 'UseDevelopmentStorage=true';

export const workerRuntimeKey: string = 'FUNCTIONS_WORKER_RUNTIME';
export const workerRuntimeVersionKey: string = 'FUNCTIONS_WORKER_RUNTIME_VERSION';
export const extensionVersionKey: string = 'FUNCTIONS_EXTENSION_VERSION';
export const runFromPackageKey: string = 'WEBSITE_RUN_FROM_PACKAGE';
export const contentConnectionStringKey: string = 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING';
export const contentShareKey: string = 'WEBSITE_CONTENTSHARE';

export const viewOutput: string = localize('viewOutput', 'View Output');
export const previewDescription: string = localize('preview', '(Preview)');

export const webProvider: string = 'Microsoft.Web';
