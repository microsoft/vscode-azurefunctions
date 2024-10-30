/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerEvent, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { func, localSettingsFileName } from '../constants';
import { getLocalSettingsJson } from '../funcConfig/local.settings';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

export interface IRunningFuncTask {
    taskExecution: vscode.TaskExecution;
    processId: number;
}

export class AzureFunctionTaskDefinition implements vscode.TaskDefinition {
    type: string;
    // This is either:
    // - vscode.WorkspaceFolder.uri.fsPath (used for most of the scenarios in this extension.)
    // - If using the exported API 'startFuncProcessFromApi', it will be the binary path wrapped with vscode.Uri.file().fsPath
    functionsApp: string

    static is(taskDefinition: vscode.TaskDefinition): taskDefinition is AzureFunctionTaskDefinition {
        return taskDefinition.type.startsWith(func) && "functionsApp" in taskDefinition;
    }
}

interface DotnetDebugDebugConfiguration extends vscode.DebugConfiguration {
    launchServiceData: { [key: string]: string }
}

namespace DotnetDebugDebugConfiguration {
    export function is(debugConfiguration: vscode.DebugConfiguration): debugConfiguration is DotnetDebugDebugConfiguration {
        return debugConfiguration.type === 'coreclr' && 'launchServiceData' in debugConfiguration
    }
}

export const runningFuncTaskMap: Map<string, IRunningFuncTask> = new Map<string, IRunningFuncTask>();

const funcTaskStartedEmitter = new vscode.EventEmitter<string>();
export const onFuncTaskStarted = funcTaskStartedEmitter.event;

export const runningFuncPortMap = new Map<string | undefined, string>();
const defaultFuncPort: string = '7071';

export function isFuncHostTask(task: vscode.Task): boolean {
    const commandLine: string | undefined = task.execution && (<vscode.ShellExecution>task.execution).commandLine;
    return /func (host )?start/i.test(commandLine || '');
}

export function registerFuncHostTaskEvents(): void {
    registerEvent('azureFunctions.onDidStartTask', vscode.tasks.onDidStartTaskProcess, async (context: IActionContext, e: vscode.TaskProcessStartEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (AzureFunctionTaskDefinition.is(e.execution.task.definition) && isFuncHostTask(e.execution.task)) {
            const workspaceFolder: vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(e.execution.task.definition.functionsApp))

            runningFuncTaskMap.set(e.execution.task.definition.functionsApp, { taskExecution: e.execution, processId: e.processId });
            runningFuncPortMap.set(e.execution.task.definition.functionsApp, await getFuncPortFromTaskOrProject(context, e.execution.task, workspaceFolder));
            funcTaskStartedEmitter.fire(e.execution.task.definition.functionsApp);
        }
    });

    registerEvent('azureFunctions.onDidEndTask', vscode.tasks.onDidEndTaskProcess, (context: IActionContext, e: vscode.TaskProcessEndEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (AzureFunctionTaskDefinition.is(e.execution.task.definition) && isFuncHostTask(e.execution.task)) {
            runningFuncTaskMap.delete(e.execution.task.definition.functionsApp);
        }
    });

    registerEvent('azureFunctions.onDidTerminateDebugSession', vscode.debug.onDidTerminateDebugSession, (context: IActionContext, debugSession: vscode.DebugSession) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;

        // Used to stop the task started with pickFuncProcess.ts startFuncProcessFromApi.
        if (DotnetDebugDebugConfiguration.is(debugSession.configuration) && debugSession.configuration.launchServiceData.buildPath) {
            const buildPathUri: vscode.Uri = vscode.Uri.file(debugSession.configuration.launchServiceData.buildPath)
            stopFuncTaskIfRunning(buildPathUri.fsPath, /* terminate */ true)
        }

        // NOTE: Only stop the func task if this is the root debug session (aka does not have a parentSession) to fix https://github.com/microsoft/vscode-azurefunctions/issues/2925
        if (getWorkspaceSetting<boolean>('stopFuncTaskPostDebug') && !debugSession.parentSession && debugSession.workspaceFolder) {
            stopFuncTaskIfRunning(debugSession.workspaceFolder.uri.fsPath);
        }
    });
}

export function stopFuncTaskIfRunning(functionApp: string, terminate: boolean = false): void {
    const runningFuncTask: IRunningFuncTask | undefined = runningFuncTaskMap.get(functionApp);
    if (runningFuncTask !== undefined) {
        if (terminate) {
            // Tasks that are spun up by an API will execute quickly that process.kill does not terminate the func host fast enough
            // that it hangs on to the port needed by a debug-restart event.
            runningFuncTask.taskExecution.terminate();
        }
        else {
            // Use `process.kill` because `TaskExecution.terminate` closes the terminal pane and erases all output
            // Also to hopefully fix https://github.com/microsoft/vscode-azurefunctions/issues/1401
            process.kill(runningFuncTask.processId);
        }
        runningFuncTaskMap.delete(functionApp);
    }
}

export async function getFuncPortFromTaskOrProject(context: IActionContext, funcTask: vscode.Task | undefined, projectPathOrTaskScope: string | vscode.WorkspaceFolder | vscode.TaskScope | undefined): Promise<string> {
    try {
        // First, check the task itself
        if (funcTask && funcTask.execution instanceof vscode.ShellExecution) {
            const match = funcTask.execution?.commandLine?.match(/\s+(?:"|'|)(?:-p|--port)(?:"|'|)\s+(?:"|'|)([0-9]+)/i);
            if (match) {
                return match[1];
            }
        }

        // Second, check local.settings.json
        let projectPath: string | undefined;
        if (typeof projectPathOrTaskScope === 'string') {
            projectPath = projectPathOrTaskScope;
        } else if (typeof projectPathOrTaskScope === 'object') {
            projectPath = await tryGetFunctionProjectRoot(context, projectPathOrTaskScope);
        }

        if (projectPath) {
            const localSettings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
            if (localSettings.Host) {
                const key = Object.keys(localSettings.Host).find(k => k.toLowerCase() === 'localhttpport');
                if (key && localSettings.Host[key]) {
                    return localSettings.Host[key];
                }
            }
        }
    } catch {
        // ignore and use default
    }

    // Finally, fall back to the default port
    return defaultFuncPort;
}
