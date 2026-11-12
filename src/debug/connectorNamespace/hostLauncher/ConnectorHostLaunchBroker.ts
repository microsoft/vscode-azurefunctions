/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import {
    connectorHostLaunchChannelVariable,
    connectorHostLaunchKeyVariable,
    connectorHostLaunchProtocolVersion,
    createBrokerProof,
    createConnectorHostLaunchSecret,
    createDecisionProof,
    decodeConnectorHostLaunchKey,
    isConnectorHostLaunchNonce,
    keysEqual,
    parseConnectorHostLaunchObservation,
    readConnectorHostLaunchMessages,
    verifyObservationProof,
    writeConnectorHostLaunchMessage,
    type ConnectorHostLaunchDecision,
    type ConnectorHostLaunchObservation,
} from './connectorHostLaunchProtocol';

export interface ConnectorHostLaunchSignal {
    /** True once the launcher disconnected, for example because the debug task was terminated. */
    readonly cancelled: boolean;
    /** Calls the listener once when the launcher disconnects. Returns a function that removes it. */
    onCancelled(listener: () => void): () => void;
}

/**
 * Runs Connector Trigger setup for the observed launch. Resolves true to start Core Tools. Values in
 * the observation can be secrets and must not be logged.
 */
export type ConnectorHostLaunchHandler = (observation: ConnectorHostLaunchObservation, signal: ConnectorHostLaunchSignal) => Promise<boolean>;

export interface ConnectorHostLaunchRegistrar {
    register(projectPath: string, handler: ConnectorHostLaunchHandler): void;
}

export interface ConnectorHostLaunchBrokerOptions {
    platform?: NodeJS.Platform;
    handshakeTimeoutMs?: number;
    registrationTimeoutMs?: number;
    now?(): number;
}

interface PendingSetup {
    projectPath: string;
    handler: ConnectorHostLaunchHandler;
    expiresAt: number;
}

const maxRememberedNonces = 1024;

/**
 * Activation-scoped local channel through which the host launcher in a debug task reports its exact
 * environment before Core Tools starts. Only a process holding this activation's key can connect
 * successfully, and the broker proves possession of the key before the launcher sends anything.
 */
export class ConnectorHostLaunchBroker implements ConnectorHostLaunchRegistrar {
    private readonly platform: NodeJS.Platform;
    private readonly handshakeTimeoutMs: number;
    private readonly registrationTimeoutMs: number;
    private readonly now: () => number;
    private readonly keyText = createConnectorHostLaunchSecret();
    private readonly key = decodeConnectorHostLaunchKey(this.keyText) as Buffer;
    private readonly channel: string;
    private readonly socketDirectory: string | undefined;
    private readonly pending: PendingSetup[] = [];
    private readonly usedNonces = new Set<string>();
    private readonly sockets = new Set<net.Socket>();
    private server: net.Server | undefined;
    private listening: Promise<void> | undefined;
    private activeSetups = 0;
    private disposed = false;

    constructor(options: ConnectorHostLaunchBrokerOptions = {}) {
        this.platform = options.platform ?? process.platform;
        this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 10_000;
        this.registrationTimeoutMs = options.registrationTimeoutMs ?? 10 * 60_000;
        this.now = options.now ?? Date.now;
        if (this.platform === 'win32') {
            this.channel = `\\\\.\\pipe\\vscode-azurefunctions-connector-${crypto.randomBytes(16).toString('hex')}`;
        } else {
            // Only this user can traverse the directory, so only this user can connect to the socket.
            this.socketDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-azfunc-'));
            fs.chmodSync(this.socketDirectory, 0o700);
            this.channel = path.join(this.socketDirectory, 'launch.sock');
        }
    }

    /** Variables that let a launcher in a task created by this activation reach this broker. */
    public getLaunchEnvironment(): Record<string, string> {
        return {
            [connectorHostLaunchChannelVariable]: this.channel,
            [connectorHostLaunchKeyVariable]: this.keyText,
        };
    }

    /** Whether the environment was created by this activation's broker. */
    public isLaunchEnvironment(environment: Readonly<Record<string, string | undefined>> | undefined): boolean {
        if (!environment || environment[connectorHostLaunchChannelVariable] !== this.channel) {
            return false;
        }
        const key = decodeConnectorHostLaunchKey(environment[connectorHostLaunchKeyVariable]);
        return !!key && keysEqual(key, this.key);
    }

    /** Starts listening, if needed. Tasks may be created before this, but must not start before it resolves. */
    public async ensureListening(): Promise<void> {
        if (this.disposed) {
            throw new Error('The Connector host launch broker was disposed.');
        }
        this.listening ??= new Promise<void>((resolve, reject) => {
            const server = net.createServer(socket => this.accept(socket));
            this.server = server;
            server.once('error', error => {
                this.listening = undefined;
                this.server = undefined;
                reject(error);
            });
            server.listen(this.channel, () => resolve());
        });
        await this.listening;
    }

    /**
     * Registers setup for the next launch whose working directory is within projectPath. A later
     * registration for the same project replaces the earlier one.
     */
    public register(projectPath: string, handler: ConnectorHostLaunchHandler): void {
        this.removeExpired();
        const index = this.pending.findIndex(entry => this.samePath(entry.projectPath, projectPath));
        if (index >= 0) {
            this.pending.splice(index, 1);
        }
        this.pending.push({ projectPath, handler, expiresAt: this.now() + this.registrationTimeoutMs });
        void this.ensureListening().catch(() => { /* The launcher reports that it cannot connect. */ });
    }

    /** Whether setup is pending or running, so callers waiting for the host can allow more time. */
    public get hasActiveSetup(): boolean {
        this.removeExpired();
        return this.activeSetups > 0 || this.pending.length > 0;
    }

    public dispose(): void {
        this.disposed = true;
        this.pending.length = 0;
        for (const socket of this.sockets) {
            socket.destroy();
        }
        this.server?.close();
        this.server = undefined;
        if (this.socketDirectory) {
            fs.rmSync(this.socketDirectory, { recursive: true, force: true });
        }
    }

    private accept(socket: net.Socket): void {
        this.sockets.add(socket);
        const serverNonce = createConnectorHostLaunchSecret();
        let clientNonce: string | undefined;
        let observed = false;
        let closed = false;
        const listeners = new Set<() => void>();
        const signal: ConnectorHostLaunchSignal = {
            get cancelled(): boolean { return closed; },
            onCancelled(listener: () => void): () => void {
                if (closed) {
                    listener();
                    return () => { /* Already called. */ };
                }
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        };
        const timer = setTimeout(() => socket.destroy(), this.handshakeTimeoutMs);
        const close = (): void => {
            clearTimeout(timer);
            socket.destroy();
        };
        socket.on('error', () => { /* Handled by close. */ });
        socket.on('close', () => {
            closed = true;
            clearTimeout(timer);
            this.sockets.delete(socket);
            for (const listener of [...listeners]) {
                listeners.delete(listener);
                try {
                    listener();
                } catch {
                    // Cancellation is best effort.
                }
            }
        });

        readConnectorHostLaunchMessages(socket, message => {
            if (closed || observed) {
                close();
                return;
            }
            if (clientNonce === undefined) {
                if (message.type !== 'hello' ||
                    message.version !== connectorHostLaunchProtocolVersion ||
                    !isConnectorHostLaunchNonce(message.clientNonce) ||
                    this.usedNonces.has(message.clientNonce)) {
                    close();
                    return;
                }
                clientNonce = message.clientNonce;
                this.rememberNonce(clientNonce);
                writeConnectorHostLaunchMessage(socket, {
                    type: 'challenge',
                    serverNonce,
                    proof: createBrokerProof(this.key, clientNonce, serverNonce),
                });
                return;
            }
            const payload = message.payload;
            if (message.type !== 'observation' ||
                typeof payload !== 'string' ||
                !verifyObservationProof(this.key, message.proof, clientNonce, serverNonce, payload)) {
                close();
                return;
            }
            const observation = parseConnectorHostLaunchObservation(payload);
            if (!observation) {
                close();
                return;
            }
            observed = true;
            clearTimeout(timer);
            const nonce = clientNonce;
            void this.decide(observation, signal).then(decision => {
                if (!closed) {
                    writeConnectorHostLaunchMessage(socket, {
                        type: 'decision',
                        decision,
                        proof: createDecisionProof(this.key, nonce, serverNonce, decision),
                    });
                    socket.end();
                }
            });
        }, close);
    }

    private async decide(observation: ConnectorHostLaunchObservation, signal: ConnectorHostLaunchSignal): Promise<ConnectorHostLaunchDecision> {
        const setup = this.takePending(observation.cwd);
        if (!setup) {
            return 'start';
        }
        this.activeSetups += 1;
        try {
            return await setup.handler(observation, signal) && !signal.cancelled ? 'start' : 'abort';
        } catch {
            return 'abort';
        } finally {
            this.activeSetups -= 1;
        }
    }

    private takePending(cwd: string): PendingSetup | undefined {
        this.removeExpired();
        let match: PendingSetup | undefined;
        for (const entry of this.pending) {
            if (this.isWithin(entry.projectPath, cwd) && (!match || entry.projectPath.length > match.projectPath.length)) {
                match = entry;
            }
        }
        if (match) {
            this.pending.splice(this.pending.indexOf(match), 1);
        }
        return match;
    }

    private removeExpired(): void {
        const now = this.now();
        for (let index = this.pending.length - 1; index >= 0; index -= 1) {
            if (this.pending[index].expiresAt <= now) {
                this.pending.splice(index, 1);
            }
        }
    }

    private rememberNonce(nonce: string): void {
        this.usedNonces.add(nonce);
        if (this.usedNonces.size > maxRememberedNonces) {
            const oldest = this.usedNonces.values().next().value;
            if (oldest !== undefined) {
                this.usedNonces.delete(oldest);
            }
        }
    }

    private normalize(value: string): string {
        const pathModule = this.platform === 'win32' ? path.win32 : path.posix;
        const resolved = pathModule.resolve(value);
        return this.platform === 'win32' ? resolved.toLowerCase() : resolved;
    }

    private samePath(left: string, right: string): boolean {
        return this.normalize(left) === this.normalize(right);
    }

    private isWithin(parent: string, child: string): boolean {
        const pathModule = this.platform === 'win32' ? path.win32 : path.posix;
        const relative = pathModule.relative(this.normalize(parent), this.normalize(child));
        return relative === '' || !!relative && !relative.startsWith('..') && !pathModule.isAbsolute(relative);
    }
}

let broker: ConnectorHostLaunchBroker | undefined;

export function getConnectorHostLaunchBroker(): ConnectorHostLaunchBroker {
    broker ??= new ConnectorHostLaunchBroker();
    return broker;
}

export function tryGetConnectorHostLaunchBroker(): ConnectorHostLaunchBroker | undefined {
    return broker;
}

export function disposeConnectorHostLaunchBroker(): void {
    broker?.dispose();
    broker = undefined;
}
