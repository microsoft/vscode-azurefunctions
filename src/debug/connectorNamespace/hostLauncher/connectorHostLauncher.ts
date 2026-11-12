/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bundled separately and run inside the debug task, so only Node built-ins may be imported.
import * as cp from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import {
    connectorHostLaunchChannelVariable,
    connectorHostLaunchKeyVariable,
    connectorHostLaunchProtocolVersion,
    createConnectorHostLaunchSecret,
    createObservationProof,
    decodeConnectorHostLaunchKey,
    isConnectorHostLaunchNonce,
    readConnectorHostLaunchMessages,
    removeConnectorHostLaunchVariables,
    verifyBrokerProof,
    verifyDecisionProof,
    writeConnectorHostLaunchMessage,
    type ConnectorHostLaunchDecision,
} from './connectorHostLaunchProtocol';

export interface ConnectorHostLauncherOptions {
    /** Core Tools command followed by its arguments. */
    args: readonly string[];
    /** The launcher's own process environment, after shell profiles and language activation. */
    environment: Readonly<Record<string, string | undefined>>;
    cwd: string;
    writeError(message: string): void;
    platform?: NodeJS.Platform;
    connect?(channel: string): net.Socket;
    spawn?(command: string, args: readonly string[], options: cp.SpawnOptions): cp.ChildProcess;
    isExecutable?(filePath: string): boolean;
    /** Called once Core Tools is started, so the caller can forward termination signals. */
    onChild?(child: cp.ChildProcess): void;
    /** Aborts before Core Tools is started, for example when the task is interrupted. */
    signal?: AbortSignal;
    handshakeTimeoutMs?: number;
    decisionTimeoutMs?: number;
}

const defaultHandshakeTimeoutMs = 15_000;
// Setup can include sign-in, consent and parameter prompts.
const defaultDecisionTimeoutMs = 30 * 60_000;
const failureExitCode = 1;

/**
 * Reports this process's environment and working directory to the extension, waits for any
 * Connector Trigger setup the extension authorizes for exactly that environment, then starts Core
 * Tools directly with the same environment and working directory. Core Tools never starts when the
 * channel cannot be authenticated or the extension does not approve the launch.
 */
export async function runConnectorHostLauncher(options: ConnectorHostLauncherOptions): Promise<number> {
    const platform = options.platform ?? process.platform;
    const [command, ...args] = options.args;
    if (!command) {
        options.writeError('Azure Functions: No Core Tools command was specified.');
        return failureExitCode;
    }

    const channel = getEnvironmentValue(options.environment, connectorHostLaunchChannelVariable, platform);
    const keyText = getEnvironmentValue(options.environment, connectorHostLaunchKeyVariable, platform);
    const key = decodeConnectorHostLaunchKey(keyText);
    // Without a channel, VS Code could not have deferred setup to this launch, so nothing is authorized.
    const handshake = channel !== undefined || keyText !== undefined;
    if (handshake && (!channel || !key)) {
        options.writeError('Azure Functions: This task can only be started by the VS Code window that created it. Start debugging again from VS Code. The Functions host was not started.');
        return failureExitCode;
    }

    const environment = removeConnectorHostLaunchVariables(options.environment, platform);
    const executable = resolveExecutable(command, environment, options.cwd, platform, options.isExecutable ?? isExecutableFile);
    if (!executable) {
        options.writeError(`Azure Functions: Could not find "${command}" on PATH. The Functions host was not started.`);
        return failureExitCode;
    }
    const invocation = getInvocation(executable, args, environment, platform);
    if (!invocation) {
        options.writeError('Azure Functions: Core Tools arguments contain characters that cannot be passed safely to a batch file. The Functions host was not started.');
        return failureExitCode;
    }

    let decision: ConnectorHostLaunchDecision = 'start';
    if (channel && key) {
        try {
            decision = await requestLaunchDecision(options, channel, key, { cwd: options.cwd, environment });
        } catch {
            options.writeError('Azure Functions: Could not confirm the Functions host launch with VS Code. Start debugging again from VS Code. The Functions host was not started.');
            return failureExitCode;
        }
    }
    if (decision !== 'start' || options.signal?.aborted) {
        options.writeError('Azure Functions: Connector Trigger setup did not complete, so the Functions host was not started.');
        return failureExitCode;
    }

    return await new Promise<number>(resolve => {
        let child: cp.ChildProcess;
        try {
            child = (options.spawn ?? cp.spawn)(invocation.command, invocation.args, {
                cwd: options.cwd,
                env: environment,
                stdio: 'inherit',
                windowsVerbatimArguments: invocation.windowsVerbatimArguments,
            });
        } catch {
            options.writeError(`Azure Functions: Could not start "${command}".`);
            resolve(failureExitCode);
            return;
        }
        child.once('error', () => {
            options.writeError(`Azure Functions: Could not start "${command}".`);
            resolve(failureExitCode);
        });
        child.once('exit', code => resolve(code ?? failureExitCode));
        options.onChild?.(child);
    });
}

async function requestLaunchDecision(
    options: ConnectorHostLauncherOptions,
    channel: string,
    key: Buffer,
    observation: { cwd: string; environment: Record<string, string> },
): Promise<ConnectorHostLaunchDecision> {
    return await new Promise<ConnectorHostLaunchDecision>((resolve, reject) => {
        const socket = (options.connect ?? (pipe => net.connect(pipe)))(channel);
        const clientNonce = createConnectorHostLaunchSecret();
        let serverNonce: string | undefined;
        let settled = false;
        let timer: NodeJS.Timeout | undefined;
        const finish = (error: Error | undefined, decision?: ConnectorHostLaunchDecision): void => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', onAbort);
            if (error) {
                socket.destroy();
                reject(error);
            } else {
                socket.end();
                resolve(decision as ConnectorHostLaunchDecision);
            }
        };
        const fail = (reason: string): void => finish(new Error(reason));
        const onAbort = (): void => fail('cancelled');
        const startTimer = (milliseconds: number): void => {
            clearTimeout(timer);
            timer = setTimeout(() => fail('timeout'), milliseconds);
        };

        if (options.signal?.aborted) {
            fail('cancelled');
            return;
        }
        options.signal?.addEventListener('abort', onAbort);
        startTimer(options.handshakeTimeoutMs ?? defaultHandshakeTimeoutMs);
        socket.on('error', () => fail('channel'));
        socket.on('close', () => fail('closed'));
        socket.once('connect', () => writeConnectorHostLaunchMessage(socket, {
            type: 'hello',
            version: connectorHostLaunchProtocolVersion,
            clientNonce,
        }));
        readConnectorHostLaunchMessages(socket, message => {
            if (settled) {
                return;
            }
            if (serverNonce === undefined) {
                // Only send the environment after the broker proves it holds the activation key.
                if (message.type !== 'challenge' ||
                    !isConnectorHostLaunchNonce(message.serverNonce) ||
                    !verifyBrokerProof(key, message.proof, clientNonce, message.serverNonce)) {
                    fail('authentication');
                    return;
                }
                serverNonce = message.serverNonce;
                const payload = JSON.stringify(observation);
                writeConnectorHostLaunchMessage(socket, {
                    type: 'observation',
                    payload,
                    proof: createObservationProof(key, clientNonce, serverNonce, payload),
                });
                startTimer(options.decisionTimeoutMs ?? defaultDecisionTimeoutMs);
                return;
            }
            const decision = message.decision;
            if (message.type !== 'decision' ||
                decision !== 'start' && decision !== 'abort' ||
                !verifyDecisionProof(key, message.proof, clientNonce, serverNonce, decision)) {
                fail('protocol');
                return;
            }
            finish(undefined, decision);
        }, () => fail('protocol'));
    });
}

interface Invocation {
    command: string;
    args: string[];
    windowsVerbatimArguments: boolean;
}

function getInvocation(executable: string, args: readonly string[], environment: Readonly<Record<string, string>>, platform: NodeJS.Platform): Invocation | undefined {
    if (platform === 'win32' && /\.(cmd|bat)$/i.test(executable)) {
        const commandLine = createWindowsBatchCommandLine(executable, args);
        if (commandLine === undefined) {
            return undefined;
        }
        const systemRoot = getEnvironmentValue(environment, 'SystemRoot', platform) ?? 'C:\\Windows';
        const comSpec = getEnvironmentValue(environment, 'ComSpec', platform) ?? path.win32.join(systemRoot, 'System32', 'cmd.exe');
        return { command: comSpec, args: ['/d', '/s', '/v:off', '/c', `"${commandLine}"`], windowsVerbatimArguments: true };
    }
    return { command: executable, args: [...args], windowsVerbatimArguments: false };
}

/**
 * Builds a cmd.exe command line that runs a batch file with literal arguments. Returns undefined
 * for values cmd.exe would expand or that cannot be quoted, rather than risk running another command.
 */
export function createWindowsBatchCommandLine(file: string, args: readonly string[]): string | undefined {
    const values = [file, ...args];
    if (values.some(value => /["%\r\n\0]/.test(value))) {
        return undefined;
    }
    // A trailing backslash would otherwise escape the closing quote for the batch file's own child process.
    return values.map(value => `"${value.replace(/(\\+)$/, '$1$1')}"`).join(' ');
}

/**
 * Resolves the command the way the task's shell would: an explicit path as given, otherwise the
 * first match on PATH (with PATHEXT on Windows), in the observed environment.
 */
export function resolveExecutable(
    command: string,
    environment: Readonly<Record<string, string>>,
    cwd: string,
    platform: NodeJS.Platform,
    isExecutable: (filePath: string) => boolean,
): string | undefined {
    const pathModule = platform === 'win32' ? path.win32 : path.posix;
    const extensions = platform === 'win32' ?
        ['', ...(getEnvironmentValue(environment, 'PATHEXT', platform) ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] :
        [''];
    const candidates = (base: string): string[] => {
        if (platform === 'win32' && pathModule.extname(base)) {
            return [base];
        }
        return extensions.map(extension => `${base}${extension}`).filter(candidate => platform !== 'win32' || pathModule.extname(candidate));
    };

    const hasSeparator = platform === 'win32' ? /[\\/]/.test(command) : command.includes('/');
    if (hasSeparator) {
        return candidates(pathModule.resolve(cwd, command)).find(isExecutable);
    }
    const directories = (getEnvironmentValue(environment, 'PATH', platform) ?? '').split(pathModule.delimiter).filter(Boolean);
    for (const directory of directories) {
        const found = candidates(pathModule.join(directory.replace(/^"(.*)"$/, '$1'), command)).find(isExecutable);
        if (found) {
            return found;
        }
    }
    return undefined;
}

function isExecutableFile(filePath: string): boolean {
    try {
        if (!fs.statSync(filePath).isFile()) {
            return false;
        }
        fs.accessSync(filePath, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

function getEnvironmentValue(environment: Readonly<Record<string, string | undefined>>, name: string, platform: NodeJS.Platform): string | undefined {
    if (environment[name] !== undefined || platform !== 'win32') {
        return environment[name];
    }
    const key = Object.keys(environment).find(candidate => candidate.toUpperCase() === name.toUpperCase());
    return key === undefined ? undefined : environment[key];
}
