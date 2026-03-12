/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerEvent, type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import * as path from 'path';
import * as vscode from 'vscode';
import { tryGetFunctionProjectRoot } from '../commands/createNewProject/verifyIsProject';
import { localSettingsFileName } from '../constants';
import { getLocalSettingsJson } from '../funcConfig/local.settings';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { addErrorLinesFromChunk } from './funcHostErrorUtils';

export interface IRunningFuncTask {
    taskExecution: vscode.TaskExecution;
    processId: number;
    portNumber: string;
    // stream for reading `func host start`  output
    stream: AsyncIterable<string> | undefined;
    logs: string[];
    /**
     * A small set of recent error lines detected in the host output.
     * Used by the Function Host Debug view to surface errors under the host node.
     */
    errorLogs?: string[];
    /**
     * Tracks whether we've already surfaced the "first error" UX for this host session (e.g. opening the Debug view).
     * This avoids repeatedly stealing focus / opening the view for every subsequent error.
     */
    hasReportedLiveErrors?: boolean;
    /**
     * AbortController used to signal when the stream iteration should stop.
     * This prevents the async iteration loop from hanging indefinitely when the task ends.
     */
    streamAbortController?: AbortController;
}

export interface IRunningFuncTaskWithScope {
    scope: vscode.WorkspaceFolder | vscode.TaskScope;
    task: IRunningFuncTask;
}

interface DotnetDebugDebugConfiguration extends vscode.DebugConfiguration {
    launchServiceData: { [key: string]: string }
}

namespace DotnetDebugDebugConfiguration {
    export function is(debugConfiguration: vscode.DebugConfiguration): debugConfiguration is DotnetDebugDebugConfiguration {
        return debugConfiguration.type === 'coreclr' && 'launchServiceData' in debugConfiguration;
    }
}

class RunningFunctionTaskMap {
    private _map: Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]> = new Map<vscode.WorkspaceFolder | vscode.TaskScope, IRunningFuncTask[]>();

    public set(key: vscode.WorkspaceFolder | vscode.TaskScope, value: IRunningFuncTask): void {
        const values = this._map.get(key) || [];
        values.push(value);
        this._map.set(key, values);
    }

    public get(key: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string): IRunningFuncTask | undefined {
        const values = this._map.get(key) || [];
        return values.find(t => {
            const taskExecution = t.taskExecution.task.execution as vscode.ShellExecution;
            // the cwd will include ${workspaceFolder} from our tasks.json so we need to replace it with the actual path
            const workspacePath = typeof t.taskExecution.task?.scope === 'object'
                ? (t.taskExecution.task.scope as vscode.WorkspaceFolder).uri?.path
                : undefined;
            const taskDirectory = workspacePath
                ? taskExecution.options?.cwd?.replace('${workspaceFolder}', workspacePath)
                : taskExecution.options?.cwd;
            const resolvedBuildPath = workspacePath
                ? buildPath?.replace('${workspaceFolder}', workspacePath)
                : buildPath;

            // When neither cwd is set, both tasks use the default working directory — treat as a match
            if (!taskDirectory && !resolvedBuildPath) {
                return true;
            }

            return taskDirectory && resolvedBuildPath && normalizePath(taskDirectory) === normalizePath(resolvedBuildPath);
        });
    }

    public getAll(key: vscode.WorkspaceFolder | vscode.TaskScope): (IRunningFuncTask | undefined)[] {
        return this._map.get(key) || [];
    }

    public has(key: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string): boolean {
        return !!this.get(key, buildPath);
    }

    public delete(key: vscode.WorkspaceFolder | vscode.TaskScope, buildPath?: string): void {
        const value = this.get(key, buildPath);
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

const funcTaskStartedEmitter = new vscode.EventEmitter<{ scope: vscode.WorkspaceFolder | vscode.TaskScope, execution?: vscode.ShellExecution }>();
export const onFuncTaskStarted = funcTaskStartedEmitter.event;

const runningFuncTasksChangedEmitter = new vscode.EventEmitter<void>();
export const onRunningFuncTasksChanged = runningFuncTasksChangedEmitter.event;

export function disposeFuncHostTaskEmitters(): void {
    funcTaskStartedEmitter.dispose();
    runningFuncTasksChangedEmitter.dispose();
}

const funcHostDebugContextKey = 'azureFunctions.funcHostDebugVisible';
const alwaysShowFuncHostDebugViewSetting = 'alwaysShowFuncHostDebugView';

function getAllRunningFuncTasks(): IRunningFuncTaskWithScope[] {
    const tasks: IRunningFuncTaskWithScope[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        for (const t of runningFuncTaskMap.getAll(folder)) {
            if (t) {
                tasks.push({ scope: folder, task: t });
            }
        }
    }

    return tasks;
}

async function updateFuncHostDebugContext(): Promise<void> {
    const alwaysShow = !!getWorkspaceSetting<boolean>(alwaysShowFuncHostDebugViewSetting);
    await vscode.commands.executeCommand('setContext', funcHostDebugContextKey, alwaysShow || getAllRunningFuncTasks().length > 0);
}

export async function refreshFuncHostDebugContext(): Promise<void> {
    await updateFuncHostDebugContext();
}

export const buildPathToWorkspaceFolderMap = new Map<string, vscode.WorkspaceFolder>();
const defaultFuncPort: string = '7071';

const funcCommandRegex: RegExp = /(func(?:\.exe)?)\s+host\s+start/i;
export function isFuncHostTask(task: vscode.Task): boolean {
    const execution = task.execution as vscode.ShellExecution | undefined;
    if (!execution) {
        return false;
    }

    // String-based ShellExecution: `commandLine` contains the full command
    if (execution.commandLine) {
        return funcCommandRegex.test(execution.commandLine);
    }

    // Args-based ShellExecution: `command` + `args` are separate
    // Reconstruct the command string to test against the regex
    const command = typeof execution.command === 'string' ? execution.command : execution.command?.value;
    if (command && execution.args) {
        const argsStr = execution.args.map(a => typeof a === 'string' ? a : a.value).join(' ');
        return funcCommandRegex.test(`${command} ${argsStr}`);
    }

    return false;
}

export function isFuncShellEvent(event: vscode.TerminalShellExecutionStartEvent): boolean {
    const commandLine = event.execution && event.execution.commandLine;
    return funcCommandRegex.test(commandLine.value || '');
}


let latestTerminalShellExecutionEvent: vscode.TerminalShellExecutionStartEvent | undefined;
export let terminalEventReader: vscode.Disposable;
export function registerFuncHostTaskEvents(): void {
    // we need to register this listener before the func host task starts, so we can capture the terminal output stream
    terminalEventReader = vscode.window.onDidStartTerminalShellExecution(async (terminalShellExecEvent) => {
        /**
         * This will pick up any terminal that, including those started outside of tasks (e.g. via the command palette).
         * But we don't actually access the terminal stream until the `func host start` task starts, at which time this will be pointing to the correct terminal
         * */
        latestTerminalShellExecutionEvent = terminalShellExecEvent;
    });
    registerEvent('azureFunctions.onDidStartTask', vscode.tasks.onDidStartTaskProcess, async (context: IActionContext, e: vscode.TaskProcessStartEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;


        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            const portNumber = await getFuncPortFromTaskOrProject(context, e.execution.task, e.execution.task.scope);
            const logs: string[] = [];
            const runningFuncTask: IRunningFuncTask = {
                processId: e.processId,
                taskExecution: e.execution,
                portNumber,
                stream: latestTerminalShellExecutionEvent?.execution.read(),
                logs,
                errorLogs: [],
                hasReportedLiveErrors: false,
                streamAbortController: new AbortController(),
            };

            runningFuncTaskMap.set(e.execution.task.scope, runningFuncTask);
            funcTaskStartedEmitter.fire({ scope: e.execution.task.scope, execution: e.execution.task.execution as vscode.ShellExecution });

            runningFuncTasksChangedEmitter.fire();
            await updateFuncHostDebugContext();
        }
    });

    registerEvent('azureFunctions.onDidChangeConfiguration', vscode.workspace.onDidChangeConfiguration, async (context: IActionContext, e: vscode.ConfigurationChangeEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;

        if (e.affectsConfiguration(`azureFunctions.${alwaysShowFuncHostDebugViewSetting}`)) {
            await updateFuncHostDebugContext();
        }
    });

    registerEvent('azureFunctions.onDidEndTask', vscode.tasks.onDidEndTaskProcess, async (context: IActionContext, e: vscode.TaskProcessEndEvent) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;
        if (e.execution.task.scope !== undefined && isFuncHostTask(e.execution.task)) {
            const task = runningFuncTaskMap.get(e.execution.task.scope, (e.execution.task.execution as vscode.ShellExecution).options?.cwd);

            // Abort the stream iteration to prevent it from hanging indefinitely
            if (task?.streamAbortController) {
                task.streamAbortController.abort();
            }

            runningFuncTaskMap.delete(e.execution.task.scope, (e.execution.task.execution as vscode.ShellExecution).options?.cwd);

            runningFuncTasksChangedEmitter.fire();
            await updateFuncHostDebugContext();
        }
    });

    registerEvent('azureFunctions.onFuncTaskStarted', onFuncTaskStarted, async (
        context: IActionContext,
        event: { scope: vscode.WorkspaceFolder | vscode.TaskScope; execution?: vscode.ShellExecution }
    ) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;

        const { scope, execution } = event;

        const task = runningFuncTaskMap.get(scope, execution?.options?.cwd);
        if (!task) {
            return;
        }

        const maxLogEntries = 1000;

        try {
            for await (const chunk of task.stream ?? []) {
                // Check if the stream iteration should be aborted
                if (task.streamAbortController?.signal.aborted) {
                    break;
                }

                task.logs.push(chunk);
                if (task.logs.length > maxLogEntries) {
                    task.logs.splice(0, task.logs.length - maxLogEntries);
                }

                // Split chunk into log entries by timestamp, check each for red
                // ANSI, and deduplicate against existing errors.
                const errorArr = task.errorLogs ?? (task.errorLogs = []);
                if (addErrorLinesFromChunk(errorArr, chunk)) {
                    runningFuncTasksChangedEmitter.fire();
                }
            }
        } catch (error) {
            // If the stream encounters an error or is aborted, gracefully exit the loop
            // This prevents the event handler from hanging indefinitely
            if (task.streamAbortController?.signal.aborted) {
                // Expected when the task ends - no need to log
                return;
            }
            // Log unexpected errors but don't throw to avoid crashing the extension
            console.error('Error reading func host task stream:', error);
        }
    });

    registerEvent('azureFunctions.onDidTerminateDebugSession', vscode.debug.onDidTerminateDebugSession, async (context: IActionContext, debugSession: vscode.DebugSession) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.suppressIfSuccessful = true;

        // Used to stop the task started with pickFuncProcess.ts startFuncProcessFromApi.
        if (DotnetDebugDebugConfiguration.is(debugSession.configuration) && debugSession.configuration.launchServiceData.buildPath) {
            const buildPathUri: vscode.Uri = vscode.Uri.file(debugSession.configuration.launchServiceData.buildPath);

            const workspaceFolder = buildPathToWorkspaceFolderMap.get(debugSession.configuration.launchServiceData.buildPath);
            if (workspaceFolder === undefined) {
                throw new Error(localize('noWorkspaceFolderForBuildPath', 'No workspace folder found for path "{0}".', buildPathUri.fsPath));
            }

            await stopFuncTaskIfRunning(workspaceFolder, buildPathUri.fsPath, false, false);

            buildPathToWorkspaceFolderMap.delete(debugSession.configuration.launchServiceData.buildPath);
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
            if (!runningFuncTaskItem) { break; }
            if (terminate) {
                runningFuncTaskItem.taskExecution.terminate();
            } else {
                // Try to find the real func process by port first, fall back to shell PID
                await killFuncProcessByPortOrPid(runningFuncTaskItem, workspaceFolder);
            }
        }

        if (buildPath) {
            runningFuncTaskMap.delete(workspaceFolder, buildPath);
        }
    }

    if (killAll) {
        runningFuncTaskMap.delete(workspaceFolder);
    }

    runningFuncTasksChangedEmitter.fire();
    await updateFuncHostDebugContext();
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
    } catch (_error) {
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
            const result = await cpUtils.tryExecuteCommand(undefined, undefined, 'netstat', composeArgs(withArg('-ano'))());
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
                    composeArgs(withArg('-Command', `Get-NetTCPConnection -LocalPort ${portNumber} -State Listen | Select-Object -ExpandProperty OwningProcess`))()
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
            const result = await cpUtils.tryExecuteCommand(undefined, undefined, 'lsof', composeArgs(withArg('-ti', `:${portNumber}`))());
            if (result.code === 0 && result.cmdOutput.trim()) {
                const pid = parseInt(result.cmdOutput.trim(), 10);
                if (!isNaN(pid)) {
                    return pid;
                }
            }
        }
    } catch (_error) {
        // ignore error
    }

    return undefined;
}

function normalizePath(fsPath: string): string {
    return vscode.Uri.parse(path.normalize(fsPath).replace(/^(\/|\\)+|(\/|\\)+$/g, '')).fsPath;
}
