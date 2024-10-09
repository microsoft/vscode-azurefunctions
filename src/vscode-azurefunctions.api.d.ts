/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardExecuteStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import type * as vscode from 'vscode';

export interface ILocalFunction {
    name: string;
    isHttpTrigger: boolean;
    isTimerTrigger: boolean;
    isAnonymous: boolean;
    triggerBindingType: string | undefined;
    functionJsonPath?: string;
}

export class ProjectNotRunningError extends Error {
}

interface InvalidLocalFunction {
    error: unknown;
    name: string;
}

interface ListLocalFunctionsResult {
    functions: ILocalFunction[];
    invalidFunctions: InvalidLocalFunction[];
}

export type LocalProjectOptions = {
    effectiveProjectPath: string;
    folder: vscode.WorkspaceFolder;
    version: string;
    language: string;
    languageModel?: number;
    preCompiledProjectPath?: string
    isIsolated?: boolean;
}

export type WorkspaceProject = { options: LocalProjectOptions };

interface UnitializedLocalProject {
    workspaceFolder: vscode.WorkspaceFolder;
    projectPath: string;
}

interface InvalidLocalProject extends UnitializedLocalProject {
    error: unknown;
}

interface ListLocalProjectsResult {
    initializedProjects: WorkspaceProject[];
    unintializedProjects: UnitializedLocalProject[];
    invalidProjects: InvalidLocalProject[];
}

export interface AzureFunctionsExtensionApi {
    apiVersion: string;

    revealTreeItem(resourceId: string): Promise<void>;

    createFunction(options: ICreateFunctionOptions): Promise<void>;
    downloadAppSettings(client: IAppSettingsClient): Promise<void>;
    uploadAppSettings(client: IAppSettingsClient, exclude?: (RegExp | string)[]): Promise<void>;

    listLocalProjects(): Promise<ListLocalProjectsResult>;
    listLocalFunctions(localProject: WorkspaceProject): Promise<ListLocalFunctionsResult>;

    /**
     *
     * @param notInstalledMessage The message to show if the tools are not installed
     * If it is not installed, the extension will prompt the user to install the tools.
     * If they install, the function will retrn true after installing the Func Core Tools.
     * If they cancel, the function will return false.
     */
    isFuncCoreToolsInstalled(notInstalledMessage: string): Promise<boolean>;
    /**
     * Starts a new function process and returns the process id of the new process. This is for .NET projects only.
     *
     * @param {vscode.WorkspaceFolder} workspaceFolder - The workspace folder of the root of the project.
     * @param {string} buildPath - The fully qualified path to the project's build output.
     * @param {string[]} args - A list of command-line arguments to pass to the process.
     *
     * @returns {Promise<{ processId: string; success: boolean; error: string }>} -
     * - `processId` {string}: The ID of the started process.
     * - `success` {boolean}: Whether the process started successfully.
     * - `error` {string}: Error message in case the process fails to start, otherwise an empty string.
    */
    startFuncProcess(workspaceFolder: vscode.WorkspaceFolder, buildPath: string, args: string[]): Promise<{ processId: string; success: boolean; error: string }>;
}

export type ProjectLanguage = 'JavaScript' | 'TypeScript' | 'C#' | 'Python' | 'PowerShell' | 'Java';
export type ProjectVersion = '~1' | '~2' | '~3' | '~4';

export interface IAppSettingsClient {
    fullName: string;
    listApplicationSettings(): Promise<IStringDictionary>;
    updateApplicationSettings(appSettings: IStringDictionary): Promise<IStringDictionary>;
}

interface IStringDictionary {
    properties?: { [propertyName: string]: string };
}

/**
 * The options to use when creating a function. If an option is not specified, the default will be used or the user will be prompted
 */
export interface ICreateFunctionOptions {
    /**
     * The folder containing the Azure Functions project
     */
    folderPath?: string;

    /**
     * The name of the function
     */
    functionName?: string;

    /**
     * The language of the project
     */
    language?: ProjectLanguage;

    /**
     * A filter specifying the langauges to display when creating a project (if there's not already a project)
     */
    languageFilter?: RegExp;

    languageModel?: number;

    /**
     * The version of the project. Defaults to the latest GA version
     */
    version?: ProjectVersion;

    /**
     * The id of the template to use.
     * NOTE: The language part of the id is optional. Aka "HttpTrigger" will work just as well as "HttpTrigger-JavaScript"
     */
    templateId?: string;

    /**
     * A case-insensitive object of settings to use for the function
     */
    functionSettings?: {
        [key: string]: string | undefined
    }

    /**
     * If set to true, it will not try to open the folder after create finishes. Defaults to false
     */
    suppressOpenFolder?: boolean;

    /**
     * If set, it will automatically select the worker runtime for .NET with the matching targetFramework
     */
    targetFramework?: string | string[];

    /**
     * If set, it will include a step that will be executed prior to OpenFolderStep determined by the priority of the step
     * OpenFolder priority is 250 (https://github.com/microsoft/vscode-azurefunctions/blob/main/src/commands/createNewProject/OpenFolderStep.ts#L11)
     */
    executeStep?: AzureWizardExecuteStep<IActionContext>;
}
