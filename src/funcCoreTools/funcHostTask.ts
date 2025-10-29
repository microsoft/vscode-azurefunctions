/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerEvent, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { localSettingsFileName } from '../constants';
import { getLocalSettingsJson } from '../funcConfig/local.settings';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { createAsyncStringStream, type AsyncStreamHandler } from '../utils/stream';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';

export interface IRunningFuncTask {
    taskExecution: vscode.TaskExecution;
    processId: number;
    portNumber: string;
    streamHandler: AsyncStreamHandler;
    outputReader: vscode.Disposable;
}

interface DotnetDebugDebugConfiguration extends vscode.DebugConfiguration {
    launchServiceData: { [key: string]: string }
}

namespace DotnetDebugDebugConfiguration {
    export function is(debugConfiguration: vscode.DebugConfiguration): debugConfiguration is DotnetDebugDebugConfiguration {
        return debugConfiguration.type === 'coreclr' && 'launchServiceData' in debugConfiguration
    }
}

class RunningFunctionTaskMap {
    private _map: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]> = new Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]>();

    public set(key: vscode.WorkspaceFolder | vscode.TaskScope, value: IRunningFuncTask): void {
        const values = this._map.get(key) || [];
        values.push(value)
        this._map.set(key, values);
    }

    public get(key: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string): IRunningFuncTask | undefined {
        const values = this._map.get(key) || [];
        return values.find(t => {
            const taskExecution = t.taskExecution.task.execution as vscode.ShellExecution;
            // the cwd will include ${workspaceFolder} from our tasks.json so we need to replace it with the actual path
            const taskDirectory = taskExecution.options?.cwd?.replace('${workspaceFolder}', (t.taskExecution.task?.scope as vscode.WorkspaceFolder).uri?.path)
            buildPath = buildPath?.replace('${workspaceFolder}', (t.taskExecution.task?.scope as vscode.WorkspaceFolder).uri?.path)
            return taskDirectory && buildPath && normalizePath(taskDirectory) === normalizePath(buildPath);
        });
    }

    public getAll(key: vscode.WorkspaceFolder | vscode.TaskScope): (IRunningFuncTask | undefined)[] {
        return this._map.get(key) || [];
    }

    public has(key: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string): boolean {
        return !!this.get(key, buildPath);
    }

    public delete(key: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string): void {
        const value = this.get(key, buildPath)
        const values = this._map.get(key) || [];

        if (value) {
            // remove the individual entry from the array
            values.splice(values.indexOf(value), 1);
            this._map.set(key, values);
        }

        if (values?.length === 0) {
            this._map.delete(key);
        }
    }
}

export const runningFuncTaskMap: RunningFunctionTaskMap = new RunningFunctionTaskMap();

const funcTaskStartedEmitter = new vscode.EventEmitter<vscode.WorkspaceFolder | vscode.TaskScope>();
export const onFuncTaskStarted = funcTaskStartedEmitter.event;

export const buildPathToWorkspaceFolderMap = new Map<string, vscode.WorkspaceFolder>();
const defaultFuncPort: string = '7071';

export function isFuncHostTask(task: vscode.Task): boolean {
    const commandLine: string | undefined = task.execution && (<vscode.ShellExecution>task.execution).commandLine;
    return /func (host )?start/i.test(commandLine || '');
}

export function isFuncHostTerminalShell(shell: vscode.TerminalShellExecutionStartEvent): boolean {
    const commandLine: string | undefined = shell.execution && shell.execution.commandLine.value;
    return /func (host )?start/i.test(commandLine || '');
}

const streamHandlerMap: Map<string, AsyncStreamHandler> = new Map();
export function registerFuncHostTaskEvents(): void {
    registerEvent('azureFunctions.onDidStartTask', vscode.tasks.onDidStartTaskProcess, async (context: IActionContext, e: vscode.TaskProcessStartEvent) => {
        const startHandler = vscode.window.onDidStartTerminalShellExecution(async (terminalShellExecEvent) => {
            console.log(`Terminal name: ${terminalShellExecEvent.terminal.name}`);
            console.log(`Task name: ${terminalShellExecEvent.execution.commandLine.value}`);
            console.log(`Process ID: ${e.processId}`);
            console.log(`Terminal PID: ${await terminalShellExecEvent.terminal.processId}`);
            if (isFuncHostTerminalShell(terminalShellExecEvent)) {
                if (!streamHandlerMap.has(e.processId.toString())) {
                    // only set it up the first time we are seeing this pid
                    const streamHandler = createAsyncStringStream();
                    streamHandler.stream = terminalShellExecEvent.execution.read();
                    streamHandlerMap.set(e.processId.toString(), streamHandler);
                }
            }
        });

        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;

        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            const terminalName = e.execution.task.name;
            // const terminal = vscode.window.terminals.find(t => terminalName === t.name);
            const portNumber = await getFuncPortFromTaskOrProject(context, e.execution.task, e.execution.task.scope);
            const endHandler = vscode.window.onDidEndTerminalShellExecution(async (terminalShellExecEvent) => {
                // reserved for closing the event handlers
                if (isFuncHostTerminalShell(terminalShellExecEvent)) {
                    for await (const chunk of runningFuncTask.streamHandler.stream) {
                        console.log(chunk);
                    }

                    startHandler.dispose();
                    endHandler.dispose();
                }
            });

            const outputReader = vscode.window.onDidWriteTerminalData(async (event: vscode.TerminalDataWriteEvent) => {
                const terminal = vscode.window.terminals.find(t => terminalName === t.name);
                if (event.terminal === terminal) {
                    // runningFuncTask.streamHandler.write(event.data);
                }
            });

            const streamHandler = streamHandlerMap.get(e.processId.toString()) || createAsyncStringStream();
            const runningFuncTask = { processId: e.processId, taskExecution: e.execution, portNumber, streamHandler, outputReader };
            runningFuncTaskMap.set(e.execution.task.scope, runningFuncTask);
            funcTaskStartedEmitter.fire(e.execution.task.scope);
        }
    });

    registerEvent('azureFunctions.onDidEndTask', vscode.tasks.onDidEndTaskProcess, (context: IActionContext, e: vscode.TaskProcessEndEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            runningFuncTaskMap.delete(e.execution.task.scope, (e.execution.task.execution as vscode.ShellExecution).options?.cwd);
        }
    });

    registerEvent('azureFunctions.onDidTerminateDebugSession', vscode.debug.onDidTerminateDebugSession, async (context: IActionContext, debugSession: vscode.DebugSession) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;

        // Used to stop the task started with pickFuncProcess.ts startFuncProcessFromApi.
        if (DotnetDebugDebugConfiguration.is(debugSession.configuration) && debugSession.configuration.launchServiceData.buildPath) {
            const buildPathUri: vscode.Uri = vscode.Uri.file(debugSession.configuration.launchServiceData.buildPath)

            const workspaceFolder = buildPathToWorkspaceFolderMap.get(debugSession.configuration.launchServiceData.buildPath)
            if (workspaceFolder === undefined) {
                throw new Error(localize('noWorkspaceFolderForBuildPath', 'No workspace folder found for path "{0}".', buildPathUri.fsPath));
            }

            await stopFuncTaskIfRunning(workspaceFolder, buildPathUri.fsPath, false, false);

            buildPathToWorkspaceFolderMap.delete(debugSession.configuration.launchServiceData.buildPath)
        }

        // NOTE: Only stop the func task if this is the root debug session (aka does not have a parentSession) to fix https://github.com/microsoft/vscode-azurefunctions/issues/2925
        if (getWorkspaceSetting<boolean>('stopFuncTaskPostDebug') && !debugSession.parentSession && debugSession.workspaceFolder) {
            // TODO: Find the exact function task from the debug session, but for now just stop all tasks in the workspace folder
            await stopFuncTaskIfRunning(debugSession.workspaceFolder, undefined, true, false);

        }
    });
}

export async function stopFuncTaskIfRunning(workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string, killAll?: boolean, terminate?: boolean): Promise<void> {
    let runningFuncTask: (IRunningFuncTask | undefined)[] | undefined;
    if (killAll) {
        // get all is needed here
        runningFuncTask = runningFuncTaskMap.getAll(workspaceFolder);
    } else {
        runningFuncTask = [runningFuncTaskMap.get(workspaceFolder, buildPath)];
    }

    if (runningFuncTask !== undefined && runningFuncTask.length > 0) {
        for (const runningFuncTaskItem of runningFuncTask) {
            if (!runningFuncTaskItem) break;
            if (terminate) {
                runningFuncTaskItem.taskExecution.terminate();
            } else {
                // Try to find the real func process by port first, fall back to shell PID
                await killFuncProcessByPortOrPid(runningFuncTaskItem, workspaceFolder);
                runningFuncTaskItem.streamHandler.end();
                runningFuncTaskItem.outputReader.dispose();
            }
        }

        if (buildPath) {
            runningFuncTaskMap.delete(workspaceFolder, buildPath);
        }
    }

    if (killAll) {
        runningFuncTaskMap.delete(workspaceFolder);
    }
}

/**
 * Kills the func process by first trying to find it by port or throws an error if it couldn't find it
 * @param runningFuncTask The running func task information
 */
async function killFuncProcessByPortOrPid(runningFuncTask: IRunningFuncTask, workspaceFolder: vscode.WorkspaceFolder | vscode.TaskScope): Promise<void> {
    try {
        // First, try to find the real func process by looking for what's listening on the port
        const realFuncPid = await findPidByPort(runningFuncTask.portNumber);

        if (realFuncPid && realFuncPid !== runningFuncTask.processId) {
            process.kill(realFuncPid);
            return;
        }

        throw new Error(`Could not find func process for port ${runningFuncTask.portNumber}`);
    } catch (error) {
        // don't look for the port and just terminate the whole process
        await stopFuncTaskIfRunning(workspaceFolder, undefined, true, true);
    }
}

export async function getFuncPortFromTaskOrProject(context: IActionContext, funcTask: vscode.Task | undefined, projectPathOrTaskScope: string | vscode.WorkspaceFolder | vscode.TaskScope): Promise<string> {
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

/**
 * Finds the process ID that is listening on the specified port
 * @param port The port number to search for
 * @returns Promise that resolves with the PID, or undefined if not found
 */
async function findPidByPort(port: string | number): Promise<number | undefined> {
    try {
        const portNumber = typeof port === 'string' ? port : port.toString();

        if (process.platform === 'win32') {
            // Windows: Use netstat to find the process using the port
            const result = await cpUtils.tryExecuteCommand(undefined, undefined, 'netstat', '-ano');
            if (result.code === 0) {
                const lines = result.cmdOutput.split('\n');
                for (const line of lines) {
                    // Look for lines like: TCP    127.0.0.1:7071    0.0.0.0:0    LISTENING    12345
                    const match = line.match(new RegExp(`\\s+TCP\\s+[^:]+:${portNumber}\\s+[^\\s]+\\s+LISTENING\\s+(\\d+)`));
                    if (match) {
                        return parseInt(match[1], 10);
                    }
                }
            }

            // Fallback: Try PowerShell Get-NetTCPConnection (Windows 8+)
            try {
                const psResult = await cpUtils.tryExecuteCommand(
                    undefined,
                    undefined,
                    'powershell',
                    '-Command',
                    `Get-NetTCPConnection -LocalPort ${portNumber} -State Listen | Select-Object -ExpandProperty OwningProcess`
                );
                if (psResult.code === 0 && psResult.cmdOutput.trim()) {
                    const pid = parseInt(psResult.cmdOutput.trim(), 10);
                    if (!isNaN(pid)) {
                        return pid;
                    }
                }
            } catch {
                // Ignore PowerShell errors, netstat should work on older Windows
            }
        } else {
            // Linux/Mac: Use lsof to find the process using the port
            const result = await cpUtils.tryExecuteCommand(undefined, undefined, 'lsof', '-ti', `:${portNumber}`);
            if (result.code === 0 && result.cmdOutput.trim()) {
                const pid = parseInt(result.cmdOutput.trim(), 10);
                if (!isNaN(pid)) {
                    return pid;
                }
            }
        }
    } catch (error) {
        // ignore error
    }

    return undefined;
}

function normalizePath(fsPath: string): string {
    return vscode.Uri.parse(path.normalize(fsPath).replace(/^(\/|\\)+|(\/|\\)+$/g, '')).fsPath;
}
