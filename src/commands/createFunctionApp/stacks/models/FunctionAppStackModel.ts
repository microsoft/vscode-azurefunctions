/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppInsightsSettings, AppStack, CommonSettings, GitHubActionSettings } from './AppStackModel';

// Types copied from here:
// https://github.com/Azure/azure-functions-ux/blob/3322f0b5151bbfcf7a08f281efe678ebac643dc0/server/src/stacks/2020-10-01/models/FunctionAppStackModel.ts

export type FunctionAppStack = AppStack<FunctionAppRuntimes, FunctionAppStackValue>;
export type FunctionAppStackValue = 'dotnet' | 'java' | 'node' | 'powershell' | 'python' | 'custom';

type FunctionsExtensionVersion = '~1' | '~2' | '~3' | '~4';
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
