/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';

/** The Azure Resources subscription fields used to select an account and request its token. */
export interface ConnectorAzdAuthSubscription {
    tenantId: string;
    account?: { id: string; label?: string };
    environment: { name: string };
    authentication: { getSessionWithScopes(scopes: string[], options?: { createIfNone?: boolean }): PromiseLike<{ accessToken: string } | undefined | null> | { accessToken: string } | undefined | null };
}

export const azdAuthEndpointSetting = 'AZD_AUTH_ENDPOINT';
export const azdAuthKeySetting = 'AZD_AUTH_KEY';
export const azdAuthCertSetting = 'AZD_AUTH_CERT';
export const azdTokenCredentialName = 'AzureDeveloperCliCredential';
const tokenPath = '/token?api-version=2023-07-12-preview';
const maxRequestBytes = 64 * 1024;
const accountsStateKey = 'connectorAzdAuthAccounts:';
const connectorPollingScope = 'https://apihub.azure.com/.default';

/** The Azure Resources account and cloud selected for one tenant. Unset fields match any value. */
export interface ConnectorAzdAuthAccount {
    accountId?: string;
    environmentName?: string;
}

/**
 * The Azure Resources sign-ins whose tokens the local Functions host receives through azd. A token request names a
 * tenant but not an event, so the host can use at most one account per tenant.
 */
export interface ConnectorAzdAuthIdentity {
    /**
     * Tenants of this project's Connector Trigger connections. Requests for any other tenant are rejected; an
     * `undefined` entry is a connection without a tenant setting, whose requests name no tenant.
     */
    tenantIds: (string | undefined)[];
    /** The account selected for each tenant, keyed by lowercase tenant ID. */
    accounts: Record<string, ConnectorAzdAuthAccount>;
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
        public readonly socketPath: string,
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
        const pipeName = `azd-auth-${randomBytes(16).toString('hex')}`;
        let directory: string | undefined;
        let socketPath: string;
        let endpoint: string;
        if (process.platform === 'win32') {
            socketPath = `\\\\.\\pipe\\${pipeName}`;
            endpoint = `npipe:${pipeName}`;
        } else {
            let tempRoot = await fs.promises.realpath(os.tmpdir());
            const socketLimit = process.platform === 'darwin' ? 104 : 108;
            if (Buffer.byteLength(path.join(tempRoot, 'azd-123456', 's')) + 1 > socketLimit) {
                tempRoot = await fs.promises.realpath('/tmp');
            }
            directory = await fs.promises.mkdtemp(path.join(tempRoot, 'azd-'));
            socketPath = path.join(directory, 's');
            endpoint = `unix:${socketPath}`;
        }
        created.instance = new ConnectorAzdAuthServer(server, endpoint, socketPath, key, identity);
        try {
            if (directory) {
                await fs.promises.chmod(directory, 0o700);
            }
            await new Promise<void>((resolve, reject) => {
                server.once('error', reject);
                server.listen(socketPath, () => {
                    server.off('error', reject);
                    resolve();
                });
            });
            if (directory) {
                await fs.promises.chmod(socketPath, 0o600);
                const socketDirectory = directory;
                server.once('close', () => {
                    void fs.promises.rmdir(socketDirectory).catch(() => {
                        ext.outputChannel.appendLog(localize('connectorAzdSocketCleanupFailed', 'Could not remove the Azure Developer CLI authentication socket directory.'));
                    });
                });
            }
        } catch (error) {
            if (server.listening) {
                await new Promise<void>(resolve => server.close(() => resolve()));
            }
            if (directory) {
                await fs.promises.rm(directory, { recursive: true, force: true });
            }
            throw error;
        }
        server.unref();
        return created.instance;
    }

    public getEnvironment(): Record<string, string> {
        return { [azdAuthEndpointSetting]: this.endpoint, [azdAuthKeySetting]: this.key, [azdAuthCertSetting]: '' };
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
 * Gets a token from the Azure Resources account selected for the requested tenant, which must be one of the project's
 * configured tenants. Every subscription of an account and tenant shares one session, so any matching subscription can
 * provide it.
 */
export async function getAzureResourcesToken(
    request: ConnectorAzdAuthTokenRequest,
    identity: ConnectorAzdAuthIdentity,
    subscriptionsProvider: () => Promise<ConnectorAzdAuthSubscription[]> = getAzureResourcesSubscriptions,
): Promise<ConnectorAzdAuthToken> {
    const tenantId = getRequestTenant(request, identity);
    const pinned = tenantId === undefined ? undefined : identity.accounts[tenantId];
    const matches = (await subscriptionsProvider()).filter(subscription => subscription.account !== undefined &&
        (tenantId === undefined || equalsIgnoreCase(subscription.tenantId, tenantId)) &&
        matchesAccount(subscription, pinned));
    const accounts = new Set(matches.map(getAccountKey));
    if (accounts.size !== 1) {
        throw new ConnectorAzdAuthTokenError('NotSignedInError', accounts.size > 1 ?
            localize('connectorAzdAuthAmbiguous', 'More than one Azure Resources account or cloud matches this Connector Trigger. Restart debugging to select the account, or sign out of the other accounts in Azure Resources.') :
            pinned ?
                localize('connectorAzdAuthSelectedAccountSignedOut', 'The Azure Resources account selected for this Connector Trigger tenant is not signed in to VS Code. Sign in with that account, or restart debugging to select another signed-in account.') :
                localize('connectorAzdAuthNotSignedIn', 'No Azure Resources account in VS Code is signed in to the tenant this Connector Trigger uses. Sign in through Azure Resources, then restart debugging.'));
    }
    const session = await matches[0].authentication.getSessionWithScopes(request.scopes, { createIfNone: true });
    if (!session) {
        throw new ConnectorAzdAuthTokenError('NotSignedInError', localize('connectorAzdAuthSessionMissing', 'The Azure Resources sign-in in VS Code did not return a session. Sign in through Azure Resources, then restart debugging.'));
    }
    return { token: session.accessToken, expiresOn: getTokenExpiry(session.accessToken) };
}

/** Returns the lowercase tenant to use for a request, rejecting tenants no configured connection uses. */
function getRequestTenant(request: ConnectorAzdAuthTokenRequest, identity: ConnectorAzdAuthIdentity): string | undefined {
    const configured = [...new Set(identity.tenantIds.map(tenantId => tenantId?.toLowerCase()))];
    if (request.tenantId) {
        const requested = request.tenantId.toLowerCase();
        if (!configured.includes(requested)) {
            throw new ConnectorAzdAuthTokenError('NotSignedInError', localize(
                'connectorAzdAuthTenantNotConfigured',
                'The local Functions host requested a token for a tenant that no Connector Trigger connection in this project uses. Set the connection tenant in local.settings.json, then restart debugging.',
            ));
        }
        return requested;
    }
    if (configured.includes(undefined)) {
        return undefined;
    }
    if (configured.length !== 1) {
        throw new ConnectorAzdAuthTokenError('NotSignedInError', localize(
            'connectorAzdAuthTenantRequired',
            'The local Functions host requested a token without a tenant, but this project\'s Connector Triggers use more than one tenant. Set the tenant for each connection in local.settings.json, then restart debugging.',
        ));
    }
    return configured[0];
}

function matchesAccount(subscription: ConnectorAzdAuthSubscription, account: ConnectorAzdAuthAccount | undefined): boolean {
    return (account?.accountId === undefined || subscription.account?.id === account.accountId) &&
        (account?.environmentName === undefined || equalsIgnoreCase(subscription.environment.name, account.environmentName));
}

function getAccountKey(subscription: ConnectorAzdAuthSubscription): string {
    return `${subscription.account?.id}\n${subscription.tenantId.toLowerCase()}\n${subscription.environment.name.toLowerCase()}`;
}

async function getAzureResourcesSubscriptions(): Promise<ConnectorAzdAuthSubscription[]> {
    return await ext.rgApi.getSubscriptions(false);
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
 * Starts the token server for a project, or updates the tenants it serves. A running host task keeps the endpoint and
 * key it started with, so a project reuses its server for the rest of the VS Code session. The account selected for
 * each tenant persists across VS Code sessions.
 */
export async function ensureConnectorAzdAuthServer(
    projectPath: string,
    tenantIds: (string | undefined)[],
    options: { pinCredential: boolean; pathDirectory?: string },
    start: (identity: ConnectorAzdAuthIdentity) => Promise<ConnectorAzdAuthServer> = async value => await ConnectorAzdAuthServer.start(value),
): Promise<ConnectorAzdAuthServer> {
    const key = normalizeProjectPath(projectPath);
    const identity: ConnectorAzdAuthIdentity = { tenantIds: [...tenantIds], accounts: getSavedAccounts(key) };
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

/** Returns the account saved for `tenantId`, if any. */
export function getConnectorAzdAuthAccount(projectPath: string, tenantId: string): ConnectorAzdAuthAccount | undefined {
    return getSavedAccounts(normalizeProjectPath(projectPath))[tenantId.toLowerCase()];
}

/** Selects the account the host uses for `tenantId`, replacing any earlier selection for that tenant. */
export async function updateConnectorAzdAuthIdentity(
    projectPath: string,
    selection: ConnectorAzdAuthAccount & { tenantId: string },
): Promise<void> {
    const key = normalizeProjectPath(projectPath);
    const accounts = {
        ...getSavedAccounts(key),
        [selection.tenantId.toLowerCase()]: {
            ...(selection.accountId ? { accountId: selection.accountId } : {}),
            ...(selection.environmentName ? { environmentName: selection.environmentName } : {}),
        },
    };
    await ext.context.workspaceState.update(accountsStateKey + key, accounts);
    const registered = servers.get(key);
    if (registered) {
        registered.server.identity = { ...registered.server.identity, accounts };
    }
}

/**
 * Restricts the server to `tenants` and obtains consent for the polling audience in each. When the account selected
 * for a tenant is no longer signed in, or no account was selected and several are signed in, prompts for the account.
 */
export async function authorizeConnectorAzdAuth(
    context: IActionContext,
    projectPath: string,
    tenants: (string | undefined)[],
    getToken: ConnectorAzdAuthTokenProvider = getAzureResourcesToken,
    subscriptionsProvider: () => Promise<ConnectorAzdAuthSubscription[]> = getAzureResourcesSubscriptions,
): Promise<void> {
    const registered = servers.get(normalizeProjectPath(projectPath));
    if (!registered) {
        throw new Error(localize('connectorAzdAuthNotPrepared', 'Azure Developer CLI authentication is not ready. Retry debugging.'));
    }
    registered.server.identity = { ...registered.server.identity, tenantIds: [...tenants] };
    const definedTenants = [...new Set(tenants.flatMap(tenantId => tenantId ? [tenantId.toLowerCase()] : []))];
    if (definedTenants.length > 0) {
        const subscriptions = await subscriptionsProvider();
        for (const tenantId of definedTenants) {
            await reselectAccount(context, projectPath, registered.server.identity, tenantId, subscriptions);
        }
    }
    for (const tenantId of tenants) {
        await getToken({ scopes: [connectorPollingScope], ...(tenantId ? { tenantId } : {}) }, registered.server.identity);
    }
}

async function reselectAccount(
    context: IActionContext,
    projectPath: string,
    identity: ConnectorAzdAuthIdentity,
    tenantId: string,
    subscriptions: ConnectorAzdAuthSubscription[],
): Promise<void> {
    const pinned = identity.accounts[tenantId];
    const candidates = new Map<string, ConnectorAzdAuthSubscription>();
    for (const subscription of subscriptions) {
        if (subscription.account && equalsIgnoreCase(subscription.tenantId, tenantId) &&
            (pinned?.environmentName === undefined || equalsIgnoreCase(subscription.environment.name, pinned.environmentName))) {
            candidates.set(getAccountKey(subscription), subscription);
        }
    }
    const signedIn = pinned !== undefined && [...candidates.values()].some(subscription => matchesAccount(subscription, pinned));
    if (signedIn || candidates.size === 0 || !pinned && candidates.size === 1) {
        // The token request reports a missing sign-in.
        return;
    }
    context.valuesToMask.push(tenantId);
    const picks: IAzureQuickPickItem<ConnectorAzdAuthSubscription>[] = [...candidates.values()].map(subscription => ({
        label: subscription.account?.label || nonNull(subscription.account).id,
        description: subscription.environment.name,
        data: subscription,
    }));
    const selected = (await context.ui.showQuickPick(picks, {
        placeHolder: pinned ?
            localize('connectorAzdAuthReselectAccount', 'The account previously selected for Connector Triggers in tenant "{0}" is not signed in. Select the Azure Resources account the local Functions host uses for this tenant.', tenantId) :
            localize('connectorAzdAuthSelectAccount', 'More than one Azure Resources account is signed in to tenant "{0}". Select the account the local Functions host uses for Connector Triggers in this tenant.', tenantId),
        stepName: 'connectorAzdAuthAccount',
        suppressPersistence: true,
    })).data;
    context.telemetry.properties.connectorAzdAuthAccountReselected = String(pinned !== undefined);
    await updateConnectorAzdAuthIdentity(projectPath, {
        tenantId,
        ...(selected.account ? { accountId: selected.account.id } : {}),
        environmentName: selected.environment.name,
    });
}

function getSavedAccounts(key: string): Record<string, ConnectorAzdAuthAccount> {
    const saved = ext.context?.workspaceState.get<unknown>(accountsStateKey + key);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
        return {};
    }
    const accounts: Record<string, ConnectorAzdAuthAccount> = {};
    for (const [tenantId, value] of Object.entries(saved as Record<string, unknown>)) {
        const { accountId, environmentName } = (value ?? {}) as { accountId?: unknown; environmentName?: unknown };
        accounts[tenantId.toLowerCase()] = {
            ...(typeof accountId === 'string' && accountId ? { accountId } : {}),
            ...(typeof environmentName === 'string' && environmentName ? { environmentName } : {}),
        };
    }
    return accounts;
}

export function disposeConnectorAzdAuthServer(projectPath: string): void {
    const key = normalizeProjectPath(projectPath);
    const registered = servers.get(key);
    if (registered) {
        servers.delete(key);
        registered.server.dispose();
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
    const projectPath = getConnectorAzdAuthProjectPath(location);
    const registered = projectPath === undefined ? undefined : servers.get(projectPath);
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

export function getConnectorAzdAuthProjectPath(location: { projectPath?: string; folderPath: string }): string | undefined {
    if (location.projectPath) {
        const projectPath = normalizeProjectPath(location.projectPath);
        return servers.has(projectPath) ? projectPath : undefined;
    }
    const folder = normalizeProjectPath(location.folderPath);
    const candidates = [...servers.keys()].filter(projectPath =>
        projectPath === folder || projectPath.startsWith(folder + path.sep));
    return candidates.length === 1 ? candidates[0] : undefined;
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
            upper === azdAuthCertSetting && value === injected[azdAuthCertSetting] ||
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
