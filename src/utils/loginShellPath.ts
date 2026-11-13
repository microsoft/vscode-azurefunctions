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

const startMarker = '__AZURE_FUNCTIONS_LOGIN_PATH_START__';
const endMarker = '__AZURE_FUNCTIONS_LOGIN_PATH_END__';
const loginShellTimeoutMs = 10 * 1000;

let loginShellPathTask: Promise<string | undefined> | undefined;

/**
 * VS Code launched from the macOS Dock/Finder (or a Linux desktop launcher) inherits a minimal PATH.
 * VS Code normally replaces it with the user's shell environment, but if that resolution fails or times out,
 * tools installed through Homebrew, nvm, etc. are missing from the extension host's PATH and child processes.
 *
 * Returns a PATH that can find `command` by appending the user's login-shell PATH entries, or `undefined`
 * when no change is needed or the login-shell PATH doesn't help.
 */
export async function getLoginShellPathForCommand(command: string, currentPath: string | undefined): Promise<string | undefined> {
    return getLoginShellPathForCommandCore(command, currentPath, process.platform, getLoginShellPath, isOnPath);
}

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
