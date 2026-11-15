/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes, timingSafeEqual } from 'crypto';
import * as http from 'http';
import { type AddressInfo } from 'net';
import * as path from 'path';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';

/** The Azure Resources subscription fields used to select an account and request its token. */
export interface ConnectorAzdAuthSubscription {
    tenantId: string;
    account?: { id: string };
    environment: { name: string };
    authentication: { getSessionWithScopes(scopes: string[]): PromiseLike<{ accessToken: string } | undefined | null> | { accessToken: string } | undefined | null };
}

export const azdAuthEndpointSetting = 'AZD_AUTH_ENDPOINT';
export const azdAuthKeySetting = 'AZD_AUTH_KEY';
export const azdTokenCredentialName = 'AzureDeveloperCliCredential';
const tokenPath = '/token?api-version=2023-07-12-preview';
const maxRequestBytes = 64 * 1024;

/**
 * The Azure Resources sign-in whose tokens the local Functions host receives through azd. Unset fields match any
 * value, but a token is returned only when exactly one account and tenant match.
 */
export interface ConnectorAzdAuthIdentity {
    tenantId?: string;
    accountId?: string;
    environmentName?: string;
}

export interface ConnectorAzdAuthTokenRequest {
    scopes: string[];
    tenantId?: string;
}

export interface ConnectorAzdAuthToken {
    token: string;
    /** Expiry as an RFC 3339 timestamp. */
    expiresOn: string;
}

export type ConnectorAzdAuthTokenProvider =
    (request: ConnectorAzdAuthTokenRequest, identity: ConnectorAzdAuthIdentity) => Promise<ConnectorAzdAuthToken>;

export class ConnectorAzdAuthTokenError extends Error {
    public constructor(public readonly code: 'GetTokenError' | 'NotSignedInError', message: string) {
        super(message);
    }
}

/**
 * Serves Azure Resources (VS Code) tokens to the Azure Developer CLI through its external authentication protocol
 * (AZD_AUTH_ENDPOINT/AZD_AUTH_KEY), so AzureDeveloperCliCredential in the local Functions host uses the VS Code sign-in.
 */
export class ConnectorAzdAuthServer {
    private constructor(
        private readonly server: http.Server,
        public readonly endpoint: string,
        private readonly key: string,
        public identity: ConnectorAzdAuthIdentity,
    ) { }

    public static async start(
        identity: ConnectorAzdAuthIdentity,
        tokenProvider: ConnectorAzdAuthTokenProvider = getAzureResourcesToken,
    ): Promise<ConnectorAzdAuthServer> {
        const key = randomBytes(32).toString('hex');
        const expectedAuthorization = Buffer.from(`Bearer ${key}`);
        const created: { instance?: ConnectorAzdAuthServer } = {};
        const server = http.createServer((request, response) => {
            if (request.method !== 'POST' || request.url !== tokenPath ||
                !request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
                response.writeHead(400).end();
                return;
            }
            const authorization = Buffer.from(request.headers.authorization ?? '');
            if (authorization.length !== expectedAuthorization.length || !timingSafeEqual(authorization, expectedAuthorization)) {
                response.writeHead(401).end();
                return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            request.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > maxRequestBytes) {
                    response.writeHead(413).end();
                    request.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            request.on('end', () => {
                if (size > maxRequestBytes) {
                    return;
                }
                void respond(response, Buffer.concat(chunks).toString('utf8'), nonNull(created.instance).identity, tokenProvider);
            });
        });
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen({ host: '127.0.0.1', port: 0 }, () => {
                server.off('error', reject);
                resolve();
            });
        });
        server.unref();
        created.instance = new ConnectorAzdAuthServer(server, `http://127.0.0.1:${(server.address() as AddressInfo).port}`, key, identity);
        return created.instance;
    }

    public getEnvironment(): Record<string, string> {
        return { [azdAuthEndpointSetting]: this.endpoint, [azdAuthKeySetting]: this.key };
    }

    public dispose(): void {
        this.server.close();
    }
}

async function respond(
    response: http.ServerResponse,
    body: string,
    identity: ConnectorAzdAuthIdentity,
    tokenProvider: ConnectorAzdAuthTokenProvider,
): Promise<void> {
    let request: ConnectorAzdAuthTokenRequest;
    try {
        const parsed: unknown = JSON.parse(body);
        const { scopes, tenantId } = (parsed ?? {}) as { scopes?: unknown; tenantId?: unknown };
        if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some(scope => typeof scope !== 'string') ||
            tenantId !== undefined && tenantId !== null && typeof tenantId !== 'string') {
            response.writeHead(400).end();
            return;
        }
        request = { scopes: scopes as string[], ...(typeof tenantId === 'string' && tenantId ? { tenantId } : {}) };
    } catch {
        response.writeHead(400).end();
        return;
    }

    // Token failures return 200 with an error status, so azd reports them differently from a broken server.
    let result: Record<string, string>;
    try {
        const token = await tokenProvider(request, identity);
        result = { status: 'success', token: token.token, expiresOn: token.expiresOn };
    } catch (error) {
        result = error instanceof ConnectorAzdAuthTokenError ?
            { status: 'error', code: error.code, message: error.message } :
            {
                status: 'error',
                code: 'GetTokenError',
                message: localize('connectorAzdAuthTokenFailed', 'VS Code could not get an Azure Resources token for the local Functions host. Sign in through Azure Resources, then restart debugging.'),
            };
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
}

/**
 * Gets a token from the single Azure Resources account signed in to the requested tenant. Every subscription of an
 * account and tenant shares one session, so any matching subscription can provide it.
 */
export async function getAzureResourcesToken(
    request: ConnectorAzdAuthTokenRequest,
    identity: ConnectorAzdAuthIdentity,
    subscriptionsProvider: () => Promise<ConnectorAzdAuthSubscription[]> = async () => await ext.rgApi.getSubscriptions(false),
): Promise<ConnectorAzdAuthToken> {
    const tenantId = request.tenantId ?? identity.tenantId;
    const matches = (await subscriptionsProvider()).filter(subscription => subscription.account !== undefined &&
        (tenantId === undefined || equalsIgnoreCase(subscription.tenantId, tenantId)) &&
        (identity.accountId === undefined || subscription.account.id === identity.accountId) &&
        (identity.environmentName === undefined || equalsIgnoreCase(subscription.environment.name, identity.environmentName)));
    const accounts = new Set(matches.map(subscription => `${subscription.account?.id}\n${subscription.tenantId.toLowerCase()}`));
    if (accounts.size !== 1) {
        throw new ConnectorAzdAuthTokenError('NotSignedInError', accounts.size === 0 ?
            localize('connectorAzdAuthNotSignedIn', 'No Azure Resources account in VS Code is signed in to the tenant this Connector Trigger uses. Sign in through Azure Resources, then restart debugging.') :
            localize('connectorAzdAuthAmbiguous', 'More than one Azure Resources account in VS Code is signed in to the tenant this Connector Trigger uses. Retry F5 and select the subscription again so setup can record which account to use.'));
    }
    const session = await matches[0].authentication.getSessionWithScopes(request.scopes);
    if (!session) {
        throw new ConnectorAzdAuthTokenError('NotSignedInError', localize('connectorAzdAuthSessionMissing', 'The Azure Resources sign-in in VS Code did not return a session. Sign in through Azure Resources, then restart debugging.'));
    }
    return { token: session.accessToken, expiresOn: getTokenExpiry(session.accessToken) };
}

/** Reads the JWT `exp` claim, falling back to a short lifetime so azd requests a new token soon. */
export function getTokenExpiry(token: string, now: number = Date.now()): string {
    let expiry = now + 5 * 60 * 1000;
    try {
        const claims: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
        const exp = (claims as { exp?: unknown } | undefined)?.exp;
        if (typeof exp === 'number' && Number.isFinite(exp)) {
            expiry = exp * 1000;
        }
    } catch {
        // Opaque tokens keep the fallback lifetime.
    }
    return new Date(expiry).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

interface RegisteredServer {
    server: ConnectorAzdAuthServer;
    /** Adds AZURE_TOKEN_CREDENTIALS=AzureDeveloperCliCredential to the host process when nothing else selects a credential. */
    pinCredential: boolean;
    pathDirectory?: string;
}

const servers = new Map<string, RegisteredServer>();
let disposalRegistered = false;

/**
 * Starts, or updates the identity of, the token server for a project. A running host task keeps the endpoint and key
 * it started with, so a project reuses its server for the rest of the VS Code session.
 */
export async function ensureConnectorAzdAuthServer(
    projectPath: string,
    identity: ConnectorAzdAuthIdentity,
    options: { pinCredential: boolean; pathDirectory?: string },
    start: (identity: ConnectorAzdAuthIdentity) => Promise<ConnectorAzdAuthServer> = async value => await ConnectorAzdAuthServer.start(value),
): Promise<ConnectorAzdAuthServer> {
    const key = normalizeProjectPath(projectPath);
    const existing = servers.get(key);
    if (existing) {
        existing.server.identity = identity;
        existing.pinCredential = options.pinCredential;
        existing.pathDirectory = options.pathDirectory;
        return existing.server;
    }
    if (!disposalRegistered && ext.context) {
        disposalRegistered = true;
        ext.context.subscriptions.push({ dispose: disposeConnectorAzdAuthServers });
    }
    const server = await start(identity);
    servers.set(key, { server, ...options });
    return server;
}

export function updateConnectorAzdAuthIdentity(projectPath: string, identity: ConnectorAzdAuthIdentity): void {
    const registered = servers.get(normalizeProjectPath(projectPath));
    if (registered) {
        registered.server.identity = identity;
    }
}

/**
 * Returns environment variables for a host task in `projectPath`, or for the single registered project under
 * `folderPath` when the task's project is unknown. `baseEnvironment` is the environment the task inherits.
 */
export function getConnectorAzdAuthTaskEnvironment(
    location: { projectPath?: string; folderPath: string },
    baseEnvironment: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> | undefined {
    let registered: RegisteredServer | undefined;
    if (location.projectPath) {
        registered = servers.get(normalizeProjectPath(location.projectPath));
    } else {
        const folder = normalizeProjectPath(location.folderPath);
        const candidates = [...servers.entries()].filter(([projectPath]) =>
            projectPath === folder || projectPath.startsWith(folder + path.sep));
        registered = candidates.length === 1 ? candidates[0][1] : undefined;
    }
    if (!registered) {
        return undefined;
    }
    const environment: Record<string, string> = { ...registered.server.getEnvironment() };
    if (registered.pinCredential) {
        environment.AZURE_TOKEN_CREDENTIALS = azdTokenCredentialName;
    }
    if (registered.pathDirectory) {
        const pathName = Object.keys(baseEnvironment).find(name => name.toUpperCase() === 'PATH') ?? 'PATH';
        const current = baseEnvironment[pathName];
        environment[pathName] = current ? `${registered.pathDirectory}${path.delimiter}${current}` : registered.pathDirectory;
    }
    return environment;
}

/**
 * Removes the values {@link getConnectorAzdAuthTaskEnvironment} injected from an environment read back from a
 * provided host task, so they are not mistaken for the user's own configuration.
 */
export function removeConnectorAzdAuthEnvironment<T extends string | null | undefined>(
    projectPath: string,
    environment: Readonly<Record<string, T>>,
): Record<string, T> {
    const registered = servers.get(normalizeProjectPath(projectPath));
    if (!registered) {
        return { ...environment };
    }
    const injected = registered.server.getEnvironment();
    const result: Record<string, T> = {};
    for (const [name, value] of Object.entries(environment)) {
        const upper = name.toUpperCase();
        if (upper === azdAuthEndpointSetting && value === injected[azdAuthEndpointSetting] ||
            upper === azdAuthKeySetting && value === injected[azdAuthKeySetting] ||
            upper === 'AZURE_TOKEN_CREDENTIALS' && registered.pinCredential && value === azdTokenCredentialName) {
            continue;
        }
        const prefix = registered.pathDirectory && `${registered.pathDirectory}${path.delimiter}`;
        if (upper === 'PATH' && prefix && typeof value === 'string' && value.startsWith(prefix)) {
            result[name] = value.slice(prefix.length) as T;
            continue;
        }
        result[name] = value;
    }
    return result;
}

export function disposeConnectorAzdAuthServers(): void {
    for (const registered of servers.values()) {
        registered.server.dispose();
    }
    servers.clear();
}

function normalizeProjectPath(value: string): string {
    const resolved = path.resolve(value);
    return process.platform === 'win32' || process.platform === 'darwin' ? resolved.toLowerCase() : resolved;
}

function equalsIgnoreCase(left: string | undefined, right: string | undefined): boolean {
    return left !== undefined && right !== undefined && left.toLowerCase() === right.toLowerCase();
}

function nonNull<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error('Unexpected undefined value.');
    }
    return value;
}
