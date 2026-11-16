/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccumulatorStream, isCancellationError, isChildProcessError, spawnStreamAsync } from '@microsoft/vscode-processutils';
import * as os from 'os';
import * as path from 'path';
import { CancellationTokenSource } from 'vscode';
import { PassThrough } from 'stream';
import which from 'which';
import { ext } from '../extensionVariables';
import { localize } from '../localize';

const startMarker = '__AZURE_FUNCTIONS_LOGIN_PATH_START__';
const endMarker = '__AZURE_FUNCTIONS_LOGIN_PATH_END__';
const loginShellTimeoutMs = 10 * 1000;

let loginShellPathTask: Promise<string | undefined> | undefined;

/**
 * VS Code launched from the macOS Dock/Finder (or a Linux desktop launcher) inherits a minimal PATH.
 * VS Code normally replaces it with the user's shell environment, but if that resolution fails or times out,
 * tools installed through Homebrew, nvm, etc. are missing from the extension host's PATH and child processes.
 * Commands the extension runs directly use a non-login `/bin/sh`, so they don't load the user's shell profile.
 *
 * Returns the environment to run `command` with, with the user's login-shell PATH entries appended,
 * or `undefined` to keep `env` when no change is needed or the login-shell PATH doesn't help.
 * Callers that set PATH keep it.
 */
export async function getLoginShellEnvForCommand(command: string, env: NodeJS.ProcessEnv | undefined): Promise<NodeJS.ProcessEnv | undefined> {
    return getLoginShellEnvForCommandCore(command, env, process.env,
        async (cmd, currentPath) => getLoginShellPathForCommandCore(cmd, currentPath, process.platform, getLoginShellPath, isOnPath));
}

export async function getLoginShellEnvForCommandCore(
    command: string,
    env: NodeJS.ProcessEnv | undefined,
    processEnv: NodeJS.ProcessEnv,
    getPathForCommand: (command: string, currentPath: string | undefined) => Promise<string | undefined>,
): Promise<NodeJS.ProcessEnv | undefined> {
    // A PATH copied from process.env (e.g. `{ ...process.env, X: 'y' }`) isn't an intentional override
    if (env?.PATH !== undefined && env.PATH !== processEnv.PATH) {
        return undefined;
    }

    const baseEnv: NodeJS.ProcessEnv = env ?? processEnv;
    const loginShellPath: string | undefined = await getPathForCommand(command, baseEnv.PATH);
    return loginShellPath ? { ...baseEnv, PATH: loginShellPath } : undefined;
}

/**
 * Returns a PATH that can find `command` by appending the user's login-shell PATH entries, or `undefined`
 * when no change is needed or the login-shell PATH doesn't help.
 */
export async function getLoginShellPathForCommandCore(
    command: string,
    currentPath: string | undefined,
    platform: NodeJS.Platform,
    getShellPath: () => Promise<string | undefined>,
    commandExists: (command: string, searchPath: string) => Promise<boolean>,
): Promise<string | undefined> {
    // Windows GUI apps inherit the full user PATH; absolute or relative commands don't use PATH
    if (platform === 'win32' || !command || command.includes('/')) {
        return undefined;
    }

    if (currentPath && await commandExists(command, currentPath)) {
        return undefined;
    }

    const shellPath: string | undefined = await getShellPath();
    if (!shellPath) {
        return undefined;
    }

    const mergedPath: string = appendMissingPathEntries(currentPath, shellPath);
    return mergedPath !== currentPath && await commandExists(command, mergedPath) ? mergedPath : undefined;
}

const taskToolCommands: string[] = ['func', 'dotnet'];
let taskPathTask: Promise<void> | undefined;

/**
 * Tasks and terminals (e.g. the F5 `func host start` and `dotnet build` tasks) don't run through cpUtils, so they
 * don't get the login-shell PATH fallback. When `func` or `dotnet` is missing from the extension host's PATH but found
 * by the login shell, append those PATH entries to terminals and tasks for this session.
 * Never rejects; resolves once per session.
 */
export async function ensureLoginShellPathForTasks(): Promise<void> {
    taskPathTask ??= (async () => {
        try {
            const entries: string | undefined = await getMissingLoginShellPathEntriesCore(taskToolCommands, process.env.PATH, process.platform, getLoginShellPath, isOnPath);
            if (entries) {
                const collection = ext.context.environmentVariableCollection;
                collection.persistent = false;
                collection.description = localize('loginShellPathForTasks', 'Adds PATH entries from your login shell so Azure Functions tasks can find the Functions Core Tools and .NET CLI.');
                collection.append('PATH', path.posix.delimiter + entries);
                ext.outputChannel?.appendLog(localize('usingLoginShellPathForTasks', 'Some tools were not found on the VS Code PATH. Tasks and terminals will use additional PATH entries from your login shell.'));
            }
        } catch {
            // Best effort; tasks keep the VS Code environment
        }
    })();
    return taskPathTask;
}

/**
 * Returns the login-shell PATH entries (joined by `:`) missing from `currentPath` when they let at least one
 * missing command resolve, or `undefined` when no change is needed or the login-shell PATH doesn't help.
 */
export async function getMissingLoginShellPathEntriesCore(
    commands: string[],
    currentPath: string | undefined,
    platform: NodeJS.Platform,
    getShellPath: () => Promise<string | undefined>,
    commandExists: (command: string, searchPath: string) => Promise<boolean>,
): Promise<string | undefined> {
    if (platform === 'win32') {
        return undefined;
    }

    const missingCommands: string[] = [];
    for (const command of commands) {
        if (!currentPath || !await commandExists(command, currentPath)) {
            missingCommands.push(command);
        }
    }
    if (missingCommands.length === 0) {
        return undefined;
    }

    const shellPath: string | undefined = await getShellPath();
    if (!shellPath) {
        return undefined;
    }

    const currentEntryCount: number = appendMissingPathEntries(currentPath, '').split(path.posix.delimiter).filter(e => !!e).length;
    const mergedPath: string = appendMissingPathEntries(currentPath, shellPath);
    const addedEntries: string = mergedPath.split(path.posix.delimiter).slice(currentEntryCount).join(path.posix.delimiter);
    if (!addedEntries) {
        return undefined;
    }

    for (const command of missingCommands) {
        if (await commandExists(command, mergedPath)) {
            return addedEntries;
        }
    }
    return undefined;
}

/**
 * Keeps the existing PATH order so commands that already resolve are unaffected
 */
export function appendMissingPathEntries(currentPath: string | undefined, additionalPath: string): string {
    const entries: string[] = (currentPath ?? '').split(path.posix.delimiter).filter(e => !!e);
    for (const entry of additionalPath.split(path.posix.delimiter)) {
        if (entry && !entries.includes(entry)) {
            entries.push(entry);
        }
    }
    return entries.join(path.posix.delimiter);
}

export function parseLoginShellPathOutput(output: string): string | undefined {
    const start: number = output.lastIndexOf(startMarker);
    const end: number = output.lastIndexOf(endMarker);
    if (start < 0 || end < start) {
        return undefined;
    }
    return output.substring(start + startMarker.length, end).trim() || undefined;
}

async function isOnPath(command: string, searchPath: string): Promise<boolean> {
    return !!await which(command, { path: searchPath, nothrow: true });
}

async function getLoginShellPath(): Promise<string | undefined> {
    // Resolve once per session; a failed or slow login shell shouldn't be retried for every command
    loginShellPathTask ??= resolveLoginShellPath();
    return loginShellPathTask;
}

function getUserShell(): string {
    if (process.env.SHELL) {
        return process.env.SHELL;
    }
    try {
        const shell: string | null = os.userInfo().shell;
        if (shell) {
            return shell;
        }
    } catch {
        // Fall back to the platform default shell
    }
    return process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh';
}

async function resolveLoginShellPath(): Promise<string | undefined> {
    const cancellation = new CancellationTokenSource();
    const output = new AccumulatorStream();
    const stdout = new PassThrough();
    stdout.pipe(output);

    let outputText: string = '';
    let completed = false;
    stdout.on('data', (chunk: Buffer) => {
        outputText += chunk.toString();
        if (!completed && outputText.includes(endMarker)) {
            completed = true;
            cancellation.cancel();
        }
    });

    // A profile may leave background processes holding stdout open; cancel as soon as the PATH markers arrive.
    const timer = setTimeout(() => cancellation.cancel(), loginShellTimeoutMs);
    try {
        // Mirrors VS Code's environment resolution: an interactive login shell applies .zprofile/.zshrc/.bash_profile.
        await spawnStreamAsync(getUserShell(), ['-i', '-l', '-c', `echo ${startMarker}; printenv PATH; echo ${endMarker}`], {
            detached: true,
            stdOutPipe: stdout,
            env: { ...process.env, VSCODE_RESOLVING_ENVIRONMENT: '1' },
            cancellationToken: cancellation.token,
        });
    } catch (error) {
        if (!isCancellationError(error) && !isChildProcessError(error) && !isErrnoException(error)) {
            throw error;
        }
    } finally {
        clearTimeout(timer);
        cancellation.dispose();
    }

    const capturedOutput: string = await output.getString();
    return parseLoginShellPathOutput(capturedOutput || outputText);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error;
}
