/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppInsightsSettings, AppStack, CommonSettings, GitHubActionSettings } from './AppStackModel';

// Types copied from here:
// https://github.com/Azure/azure-functions-ux/blob/fa150ffa944e93c6d08cc9798b558e7095febee3/server/src/stacks/2020-10-01/models/FunctionAppStackModel.ts
// tslint:disable: interface-name

export type FunctionAppStack = AppStack<FunctionAppRuntimes, FunctionAppStackValue>;
export type FunctionAppStackValue = 'dotnet' | 'java' | 'node' | 'powershell' | 'python' | 'custom';

type FunctionsExtensionVersion = '~1' | '~2' | '~3';
type FunctionsWorkerRuntime = 'dotnet' | 'node' | 'python' | 'java' | 'powershell' | 'custom';

export interface FunctionAppRuntimes {
    linuxRuntimeSettings?: FunctionAppRuntimeSettings;
    windowsRuntimeSettings?: FunctionAppRuntimeSettings;
}

export interface AppSettingsDictionary {
    FUNCTIONS_WORKER_RUNTIME?: FunctionsWorkerRuntime;
    WEBSITE_NODE_DEFAULT_VERSION?: string;
}

export interface SiteConfigPropertiesDictionary {
    use32BitWorkerProcess: boolean;
    linuxFxVersion?: string;
    javaVersion?: string;
    powerShellVersion?: string;
}

export interface FunctionAppRuntimeSettings extends CommonSettings {
    runtimeVersion: string;
    remoteDebuggingSupported: boolean;
    appInsightsSettings: AppInsightsSettings;
    gitHubActionSettings: GitHubActionSettings;
    appSettingsDictionary: AppSettingsDictionary;
    siteConfigPropertiesDictionary: SiteConfigPropertiesDictionary;
    supportedFunctionsExtensionVersions: FunctionsExtensionVersion[];
}
