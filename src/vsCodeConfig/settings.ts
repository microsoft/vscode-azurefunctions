/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import * as path from 'path';
import { ConfigurationTarget, Uri, workspace, type WorkspaceConfiguration, type WorkspaceFolder } from "vscode";
import { ProjectLanguage, settingsFileName } from '../constants';
import { ext } from "../extensionVariables";
import { dotnetUtils } from "../utils/dotnetUtils";
import { confirmEditJsonFile } from "../utils/fs";

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
export async function updateWorkspaceSetting<T = string>(section: string, value: T, fsPath: string | WorkspaceFolder, prefix: string = ext.prefix): Promise<void> {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(prefix, getScope(fsPath));
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
export function getWorkspaceSetting<T>(key: string, fsPath?: string | WorkspaceFolder, prefix: string = ext.prefix): T | undefined {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration(prefix, getScope(fsPath));
    return projectConfiguration.get<T>(key);
}

function getScope(fsPath: WorkspaceFolder | string | undefined): Uri | WorkspaceFolder | undefined {
    return typeof fsPath === 'string' ? Uri.file(fsPath) : fsPath;
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

/**
 * Gets the "root" worker runtime, aka not the project-specific worker runtime
 * For example, this will return 'dotnet', never 'dotnet-isolated'
 */
export function getRootFunctionsWorkerRuntime(language: string | undefined): string | undefined {
    switch (language) {
        case ProjectLanguage.JavaScript:
        case ProjectLanguage.TypeScript:
            return 'node';
        case ProjectLanguage.CSharp:
        case ProjectLanguage.FSharp:
            return 'dotnet';
        case ProjectLanguage.Ballerina:
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

export async function tryGetFunctionsWorkerRuntimeForProject(context: IActionContext, language: string | undefined, projectPath: string | undefined): Promise<string | undefined> {
    let runtime = getRootFunctionsWorkerRuntime(language);
    if (language === ProjectLanguage.CSharp || language === ProjectLanguage.FSharp) {
        if (projectPath) {
            const projFiles: dotnetUtils.ProjectFile[] = await dotnetUtils.getProjFiles(context, language, projectPath);
            if (projFiles.length === 1) {
                if (await dotnetUtils.getIsIsolated(projFiles[0])) {
                    runtime += '-isolated';
                }
                return runtime;
            }
        }

        // Couldn't definitively determine isolated vs. non-isolated, so return undefined
        return undefined;
    }

    return runtime;
}

export function isKnownWorkerRuntime(runtime: string | undefined): boolean {
    return !!runtime && ['node', 'dotnet', 'dotnet-isolated', 'java', 'python', 'powershell', 'custom'].includes(runtime.toLowerCase());
}

export function promptToUpdateDotnetRuntime(azureRuntime: string | undefined, localRuntime: string | undefined): boolean {
    return azureRuntime === 'dotnet' && localRuntime === 'dotnet-isolated' ||
        azureRuntime === 'dotnet-isolated' && localRuntime === 'dotnet'
}

export function getFuncWatchProblemMatcher(language: string | undefined): string {
    const runtime: string | undefined = getRootFunctionsWorkerRuntime(language);
    return runtime && runtime !== 'custom' ? `$func-${runtime}-watch` : '$func-watch';
}

export async function writeToSettingsJson(context: IActionContext, vscodePath: string, key: string, value: string): Promise<void> {
    const settingsJsonPath: string = path.join(vscodePath, settingsFileName);
    const settings = [{ key, value }];
    await confirmEditJsonFile(
        context,
        settingsJsonPath,
        (data: {}): {} => {
            for (const setting of settings) {
                const key: string = `${ext.prefix}.${setting.key}`;
                data[key] = setting.value;
            }
            return data;
        }
    );
}
