/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const isWindows: boolean = /^win/.test(process.platform);

export const extensionPrefix: string = 'azureFunctions';
export const projectLanguageSetting: string = 'projectLanguage';
export const projectRuntimeSetting: string = 'projectRuntime';
export const templateFilterSetting: string = 'templateFilter';
export const deploySubpathSetting: string = 'deploySubpath';
export const templateVersionSetting: string = 'templateVersion';
export const preDeployTaskSetting: string = 'preDeployTask';
export const filesExcludeSetting: string = 'files.exclude';

export enum ProjectLanguage {
    Bash = 'Bash',
    Batch = 'Batch',
    CSharp = 'C#',
    CSharpScript = 'C#Script',
    FSharp = 'F#',
    FSharpScript = 'F#Script',
    Java = 'Java',
    JavaScript = 'JavaScript',
    PHP = 'PHP',
    PowerShell = 'PowerShell',
    Python = 'Python',
    TypeScript = 'TypeScript'
}

export enum ProjectRuntime {
    v1 = '~1',
    v2 = '~2'
}

export enum TemplateFilter {
    All = 'All',
    Core = 'Core',
    Verified = 'Verified'
}

export enum Platform {
    Windows = 'win32',
    MacOS = 'darwin',
    Linux = 'linux'
}

export const hostFileName: string = 'host.json';
export const localSettingsFileName: string = 'local.settings.json';
export const proxiesFileName: string = 'proxies.json';
export const tasksFileName: string = 'tasks.json';
export const settingsFileName: string = 'settings.json';
export const vscodeFolderName: string = '.vscode';
export const gitignoreFileName: string = '.gitignore';

export enum PackageManager {
    npm,
    brew
}

export const funcPackageName: string = 'azure-functions-core-tools';

export enum ScmType {
    None = 'None', // default scmType
    LocalGit = 'LocalGit',
    GitHub = 'GitHub'
}

export const publishTaskId: string = 'publish';
export const funcPackId: string = 'funcPack';

export const func: string = 'func';
export const extInstallCommand: string = 'extensions install';
export const extInstallTaskName: string = `${func}: ${extInstallCommand}`;
export const funcExtInstallCommand: string = `${func} ${extInstallCommand}`;

export const hostStartCommand: string = 'host start';
export const hostStartTaskName: string = `${func}: ${hostStartCommand}`;
export const funcHostStartCommand: string = `${func} ${hostStartCommand}`;

export const funcWatchProblemMatcher: string = '$func-watch';

export const localhost: string = '127.0.0.1';
