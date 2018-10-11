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
export const installExtensionsId: string = 'installExtensions';
export const funcPackId: string = 'funcPack';
