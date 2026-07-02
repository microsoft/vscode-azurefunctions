/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { dotnetIsolatedDebugFlag, enableJsonOutputFlag, jsonOutputFileFlag } from '../constants';

/**
 * Reads the .NET isolated worker process ID written by func core tools to the file passed via
 * `--json-output-file`. Returns undefined if the file does not yet exist or does not contain a
 * `workerProcessId`. The picker polls this until the worker is up.
 */
export async function getWorkerPidFromJsonOutput(workerPidFile: string | undefined): Promise<number | undefined> {
    if (!workerPidFile) {
        return;
    }

    try {
        if (!await AzExtFsExtra.pathExists(workerPidFile)) {
            return;
        }
        const content = await AzExtFsExtra.readFile(workerPidFile);
        const obj = JSON.parse(content) as Record<string, unknown>;
        if (typeof obj['workerProcessId'] === 'number') {
            return obj['workerProcessId'];
        }
    } catch {
        // file not yet written or invalid JSON - keep waiting
    }
    return;
}

/**
 * Extracts the value passed to `--json-output-file` from a func host task's execution.
 * Returns undefined if the flag is not present. Supports both `--json-output-file <path>`
 * (separate args) and `--json-output-file=<path>` (combined) forms, as well as both
 * args-based and commandLine-based ShellExecution.
 */
export function getJsonOutputFilePathFromTask(task: vscode.Task): string | undefined {
    const execution = task.execution as vscode.ShellExecution | undefined;
    if (!execution) {
        return undefined;
    }

    if (execution.commandLine) {
        return parseJsonOutputFileFromString(execution.commandLine);
    }

    if (execution.args) {
        const args = execution.args.map(a => (typeof a === 'string' ? a : a.value));
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === jsonOutputFileFlag && i + 1 < args.length) {
                return stripQuotes(args[i + 1]);
            }
            if (arg.startsWith(`${jsonOutputFileFlag}=`)) {
                return stripQuotes(arg.substring(jsonOutputFileFlag.length + 1));
            }
        }
    }
    return undefined;
}

/**
 * Returns true if `commandLine` is configured for dotnet-isolated debugging with JSON output but
 * does not already specify `--json-output-file`. When true, the caller should inject one so the
 * worker PID is written to a file we can poll.
 */
export function shouldInjectJsonOutputFile(commandLine: string): boolean {
    return commandLine.includes(dotnetIsolatedDebugFlag)
        && commandLine.includes(enableJsonOutputFlag)
        && !commandLine.includes(jsonOutputFileFlag);
}

/**
 * Returns true if the func task is configured for dotnet-isolated debugging with JSON output. When
 * true, the picker waits for a worker PID (from --json-output-file or parsed from the terminal
 * stream) instead of polling the host status endpoint.
 */
export function isDotnetIsolatedDebugTask(funcTask: vscode.Task): boolean {
    if (!(funcTask.execution instanceof vscode.ShellExecution)) {
        return false;
    }
    const flatArgs = getFlatShellArgs(funcTask.execution);
    return flatArgs.includes(dotnetIsolatedDebugFlag) && flatArgs.includes(enableJsonOutputFlag);
}

export function generateJsonOutputFilePath(): string {
    return path.join(os.tmpdir(), `azfunc-worker-pid-${process.pid}-${Date.now()}.json`);
}

/**
 * If the user's func task is configured for dotnet-isolated debugging with JSON output but does not
 * already specify a `--json-output-file`, returns a wrapper task with that flag injected so func
 * core tools writes the worker PID directly to a file we control.
 */
export function injectJsonOutputFileArgIfNeeded(funcTask: vscode.Task): vscode.Task {
    const exec = funcTask.execution;
    if (!(exec instanceof vscode.ShellExecution)) {
        return funcTask;
    }

    const flatArgs = getFlatShellArgs(exec);
    const hasDebugFlag = flatArgs.includes(dotnetIsolatedDebugFlag);
    const hasEnableJsonOutput = flatArgs.includes(enableJsonOutputFlag);
    const alreadyHasOutputFile = flatArgs.includes(jsonOutputFileFlag) || flatArgs.some(a => a.startsWith(`${jsonOutputFileFlag}=`));
    if (!hasDebugFlag || !hasEnableJsonOutput || alreadyHasOutputFile) {
        return funcTask;
    }

    const jsonOutputFile = generateJsonOutputFilePath();
    let newExec: vscode.ShellExecution;
    if (exec.commandLine !== undefined) {
        newExec = new vscode.ShellExecution(`${exec.commandLine} ${jsonOutputFileFlag} "${jsonOutputFile}"`, exec.options);
    } else {
        // When constructed with command + args, both are defined; defensively coalesce to satisfy the API types.
        newExec = new vscode.ShellExecution(exec.command ?? 'func', [...(exec.args ?? []), jsonOutputFileFlag, jsonOutputFile], exec.options);
    }

    const wrapped = new vscode.Task(
        funcTask.definition,
        funcTask.scope ?? vscode.TaskScope.Workspace,
        funcTask.name,
        funcTask.source,
        newExec,
        funcTask.problemMatchers,
    );
    wrapped.isBackground = funcTask.isBackground;
    wrapped.presentationOptions = funcTask.presentationOptions;
    wrapped.group = funcTask.group;
    wrapped.runOptions = funcTask.runOptions;
    wrapped.detail = funcTask.detail;
    return wrapped;
}

function parseJsonOutputFileFromString(commandLine: string): string | undefined {
    // matches --json-output-file=<value>, --json-output-file <value>, with optional single/double quotes around <value>
    const match = commandLine.match(/--json-output-file(?:=|\s+)("[^"]+"|'[^']+'|\S+)/);
    return match ? stripQuotes(match[1]) : undefined;
}

function stripQuotes(value: string): string {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}

function getFlatShellArgs(exec: vscode.ShellExecution): string[] {
    if (exec.commandLine !== undefined) {
        // Best-effort split for detection; quoting/escaping is preserved in the original commandLine when we re-emit.
        return exec.commandLine.split(/\s+/).filter(Boolean);
    }
    return (exec.args ?? []).map(a => (typeof a === 'string' ? a : a.value));
}
