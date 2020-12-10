/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationTarget, Uri, workspace, WorkspaceConfiguration } from "vscode";
import { ProjectLanguage } from '../constants';
import { ext } from "../extensionVariables";

/**
 * Uses ext.prefix 'azureFunctions' unless otherwise specified
 */
export async function updateGlobalSetting<T = string>(section: string, value: T, prefix: string = ext.prefix): Promise<void> {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(prefix);
    await projectConfiguration.update(section, value, ConfigurationTarget.Global);
}

/**
 * Uses ext.prefix 'azureFunctions' unless otherwise specified
 */
export async function updateWorkspaceSetting<T = string>(section: string, value: T, fsPath: string, prefix: string = ext.prefix): Promise<void> {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(prefix, Uri.file(fsPath));
    await projectConfiguration.update(section, value);
}

/**
 * Uses ext.prefix 'azureFunctions' unless otherwise specified
 */
export function getGlobalSetting<T>(key: string, prefix: string = ext.prefix): T | undefined {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(prefix);
    const result: { globalValue?: T } | undefined = projectConfiguration.inspect<T>(key);
    return result && result.globalValue;
}

/**
 * Uses ext.prefix 'azureFunctions' unless otherwise specified
 */
export function getWorkspaceSetting<T>(key: string, fsPath?: string, prefix: string = ext.prefix): T | undefined {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(prefix, fsPath ? Uri.file(fsPath) : undefined);
    return projectConfiguration.get<T>(key);
}

/**
 * Searches through all open folders and gets the current workspace setting (as long as there are no conflicts)
 * Uses ext.prefix 'azureFunctions' unless otherwise specified
 */
export function getWorkspaceSettingFromAnyFolder(key: string, prefix: string = ext.prefix): string | undefined {
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        let result: string | undefined;
        for (const folder of workspace.workspaceFolders) {
            const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(prefix, folder.uri);
            const folderResult: string | undefined = projectConfiguration.get<string>(key);
            if (!result) {
                result = folderResult;
            } else if (folderResult && result !== folderResult) {
                return undefined;
            }
        }
        return result;
    } else {
        return getGlobalSetting(key, prefix);
    }
}

export function getFunctionsWorkerRuntime(language: string | undefined): string | undefined {
    switch (language) {
        case ProjectLanguage.JavaScript:
        case ProjectLanguage.TypeScript:
            return 'node';
        case ProjectLanguage.CSharp:
        case ProjectLanguage.FSharp:
            return 'dotnet';
        case ProjectLanguage.Java:
            return 'java';
        case ProjectLanguage.Python:
            return 'python';
        case ProjectLanguage.PowerShell:
            return 'powershell';
        case ProjectLanguage.Custom:
            return 'custom';
        default:
            return undefined;
    }
}

export function isKnownWorkerRuntime(runtime: string | undefined): boolean {
    return !!runtime && ['node', 'dotnet', 'java', 'python', 'powershell', 'custom'].includes(runtime.toLowerCase());
}

export function getFuncWatchProblemMatcher(language: string | undefined): string {
    const runtime: string | undefined = getFunctionsWorkerRuntime(language);
    return runtime && runtime !== 'custom' ? `$func-${runtime}-watch` : '$func-watch';
}
