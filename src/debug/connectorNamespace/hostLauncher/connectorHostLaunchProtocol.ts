/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared by the extension and the standalone launcher bundle, so only Node built-ins may be imported.
import * as crypto from 'crypto';
import { type Socket } from 'net';

/** Named pipe or Unix socket of the extension's launch broker for this activation. */
export const connectorHostLaunchChannelVariable = 'AZURE_FUNCTIONS_CONNECTOR_LAUNCH_CHANNEL';
/** Activation-scoped key both sides prove possession of. Never forwarded to the Functions host. */
export const connectorHostLaunchKeyVariable = 'AZURE_FUNCTIONS_CONNECTOR_LAUNCH_KEY';
/** Lets the VS Code executable run the launcher as Node. Never forwarded to the Functions host. */
export const electronRunAsNodeVariable = 'ELECTRON_RUN_AS_NODE';

export const connectorHostLaunchVariables: readonly string[] = [
    connectorHostLaunchChannelVariable,
    connectorHostLaunchKeyVariable,
    electronRunAsNodeVariable,
];

export const connectorHostLaunchProtocolVersion = 1;
export const maxConnectorHostLaunchMessageLength = 4 * 1024 * 1024;

const proofLabels = {
    broker: 'azure-functions-connector-launch/v1/broker',
    observation: 'azure-functions-connector-launch/v1/observation',
    decision: 'azure-functions-connector-launch/v1/decision',
} as const;

export type ConnectorHostLaunchDecision = 'start' | 'abort';

/** Environment and working directory of the task process that will start Core Tools. Values can be secrets. */
export interface ConnectorHostLaunchObservation {
    cwd: string;
    environment: Record<string, string>;
}

export type ConnectorHostLaunchMessage =
    | { type: 'hello'; version: number; clientNonce: string }
    | { type: 'challenge'; serverNonce: string; proof: string }
    | { type: 'observation'; payload: string; proof: string }
    | { type: 'decision'; decision: ConnectorHostLaunchDecision; proof: string };

export function createConnectorHostLaunchSecret(): string {
    return crypto.randomBytes(32).toString('base64url');
}

export function decodeConnectorHostLaunchKey(value: string | undefined): Buffer | undefined {
    if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
        return undefined;
    }
    const key = Buffer.from(value, 'base64url');
    return key.length === 32 ? key : undefined;
}

export function isConnectorHostLaunchNonce(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function createBrokerProof(key: Buffer, clientNonce: string, serverNonce: string): string {
    return createProof(key, proofLabels.broker, clientNonce, serverNonce);
}

export function createObservationProof(key: Buffer, clientNonce: string, serverNonce: string, payload: string): string {
    return createProof(key, proofLabels.observation, clientNonce, serverNonce, payload);
}

export function createDecisionProof(key: Buffer, clientNonce: string, serverNonce: string, decision: ConnectorHostLaunchDecision): string {
    return createProof(key, proofLabels.decision, clientNonce, serverNonce, decision);
}

export function verifyBrokerProof(key: Buffer, proof: unknown, clientNonce: string, serverNonce: string): boolean {
    return proofsEqual(proof, createBrokerProof(key, clientNonce, serverNonce));
}

export function verifyObservationProof(key: Buffer, proof: unknown, clientNonce: string, serverNonce: string, payload: string): boolean {
    return proofsEqual(proof, createObservationProof(key, clientNonce, serverNonce, payload));
}

export function verifyDecisionProof(key: Buffer, proof: unknown, clientNonce: string, serverNonce: string, decision: ConnectorHostLaunchDecision): boolean {
    return proofsEqual(proof, createDecisionProof(key, clientNonce, serverNonce, decision));
}

export function keysEqual(left: Buffer, right: Buffer): boolean {
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createProof(key: Buffer, ...parts: string[]): string {
    // Nonces are base64url and payloads are JSON, so neither contains a raw newline.
    return crypto.createHmac('sha256', key).update(parts.join('\n')).digest('base64url');
}

function proofsEqual(actual: unknown, expected: string): boolean {
    if (typeof actual !== 'string') {
        return false;
    }
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Removes the launch channel variables, matching names case-insensitively on Windows like the
 * process environment does. The result is the environment Core Tools is started with.
 */
export function removeConnectorHostLaunchVariables(
    environment: Readonly<Record<string, string | undefined>>,
    platform: NodeJS.Platform = process.platform,
): Record<string, string> {
    const normalize = (name: string): string => platform === 'win32' ? name.toUpperCase() : name;
    const removed = new Set(connectorHostLaunchVariables.map(normalize));
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(environment)) {
        if (value !== undefined && !removed.has(normalize(name))) {
            result[name] = value;
        }
    }
    return result;
}

export function parseConnectorHostLaunchObservation(payload: string): ConnectorHostLaunchObservation | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(payload);
    } catch {
        return undefined;
    }
    if (!parsed || typeof parsed !== 'object') {
        return undefined;
    }
    const { cwd, environment } = parsed as { cwd?: unknown; environment?: unknown };
    if (typeof cwd !== 'string' || !cwd || !environment || typeof environment !== 'object' || Array.isArray(environment)) {
        return undefined;
    }
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(environment as Record<string, unknown>)) {
        if (typeof value !== 'string') {
            return undefined;
        }
        result[name] = value;
    }
    return { cwd, environment: result };
}

export function writeConnectorHostLaunchMessage(socket: Socket, message: ConnectorHostLaunchMessage): void {
    socket.write(`${JSON.stringify(message)}\n`);
}

/**
 * Reads newline-delimited JSON messages. Calls onInvalid, and stops reading, for an oversized or
 * malformed message.
 */
export function readConnectorHostLaunchMessages(
    socket: Socket,
    onMessage: (message: Record<string, unknown>) => void,
    onInvalid: () => void,
): void {
    let buffered = '';
    let stopped = false;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
        if (stopped) {
            return;
        }
        buffered += chunk;
        for (let index = buffered.indexOf('\n'); index >= 0 && !stopped; index = buffered.indexOf('\n')) {
            const line = buffered.slice(0, index);
            buffered = buffered.slice(index + 1);
            if (line.length > maxConnectorHostLaunchMessageLength) {
                stopped = true;
                onInvalid();
                return;
            }
            let message: unknown;
            try {
                message = JSON.parse(line);
            } catch {
                message = undefined;
            }
            if (!message || typeof message !== 'object' || Array.isArray(message) || typeof (message as { type?: unknown }).type !== 'string') {
                stopped = true;
                onInvalid();
                return;
            }
            onMessage(message as Record<string, unknown>);
        }
        if (!stopped && buffered.length > maxConnectorHostLaunchMessageLength) {
            stopped = true;
            onInvalid();
        }
    });
}
