/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { localize } from '../../localize';
import { cpUtils } from '../../utils/cpUtils';
import {
    ConnectorTriggerF5SetupError,
    type ConnectorTriggerHostCredentialConfiguration,
    type ConnectorTriggerPrincipal,
} from './connectorTriggerF5Contracts';

// The Connector extension requests this scope; Azure CLI receives it as a resource.
export const connectorPollingTokenScope = 'https://apihub.azure.com/.default';
const connectorPollingTokenResource = 'https://apihub.azure.com';
// Azure.Identity AzureAuthorityHosts.AzurePublicCloud, used when AZURE_AUTHORITY_HOST is unset.
const defaultAuthorityHost = 'https://login.microsoftonline.com/';
// Prefixes .NET environment configuration maps to ConnectionStrings:<name>.
const connectionStringEnvironmentPrefixes = ['customconnstr_', 'mysqlconnstr_', 'postgresqlconnstr_', 'sqlazureconnstr_', 'sqlconnstr_'];
// Variables that select the Azure CLI account the host's AzureCliCredential runs with.
const azureCliEnvironmentVariables = new Set(['HOME', 'HOMEDRIVE', 'HOMEPATH', 'PATH', 'USERPROFILE']);

type HostEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * The credential the local Functions host will build, limited to the cases whose principal VS Code
 * can establish by acquiring a token with the same inputs in the same environment.
 */
export type ConnectorHostCredentialPlan =
    | {
        kind: 'clientSecret';
        source: 'connectionSettings' | 'environmentCredential';
        tenantId: string;
        clientId: string;
        clientSecret: string;
        authorityHost: string;
    }
    | {
        kind: 'azureCli';
        tenantId?: string;
        environment: HostEnvironment;
    }
    | {
        kind: 'unsupported';
        reason: ConnectorHostCredentialUnsupportedReason;
        settingNames?: readonly string[];
    };

export type ConnectorHostCredentialUnsupportedReason =
    | 'launchUnknown'
    | 'taskLaunch'
    | 'taskEnvironmentOverride'
    | 'conflictingConnectionSection'
    | 'explicitCredentialType'
    | 'azureCloudSetting'
    | 'clientCertificate'
    | 'invalidConnectionSettings'
    | 'defaultCredentialChain'
    | 'unsupportedTokenCredentialsSelection'
    | 'environmentCredentialIncomplete'
    | 'environmentCredentialTenantConflict';

export interface ConnectorPollingTokenProvider {
    getClientSecretToken(
        context: IActionContext,
        request: { tenantId: string; clientId: string; clientSecret: string; authorityHost: string },
    ): Promise<string>;
    getAzureCliToken(
        context: IActionContext,
        request: { tenantId?: string; environment: HostEnvironment },
    ): Promise<string>;
}

/**
 * Mirrors the credential the Connector extension builds for Poll delivery:
 * Microsoft.Extensions.Azure 1.13.1 `ClientFactory.CreateCredential` on the section returned by
 * WebJobs `GetWebJobsConnectionSection`, falling back to the .NET Azure.Identity 1.17.1
 * `DefaultAzureCredential` (with `TenantId` from the connection section or AZURE_TENANT_ID). The
 * .NET chain differs from the JavaScript SDK chain and depends on developer tools available to the
 * host process, so an unpinned chain is never guessed.
 *
 * Exact launch environments and environments observed by a task probe are evaluated. Launch
 * environment values take precedence over local.settings.json Values, matching Core Tools.
 */
export function planConnectorHostCredential(hostCredential: ConnectorTriggerHostCredentialConfiguration): ConnectorHostCredentialPlan {
    const connectionSettingName = hostCredential.connectionSettingName;
    const launch = hostCredential.launch;
    if (!launch) {
        return { kind: 'unsupported', reason: 'launchUnknown' };
    }
    if (launch.kind === 'task') {
        const overrides = Object.keys(launch.environment)
            .filter(name => isConnectorHostCredentialVariable(name, connectionSettingName));
        return overrides.length > 0 ?
            { kind: 'unsupported', reason: 'taskEnvironmentOverride', settingNames: overrides } :
            { kind: 'unsupported', reason: 'taskLaunch' };
    }

    const launchEnvironment = launch.environment;
    // The WebJobs host reads AzureWebJobs<name> and ConnectionStrings sections before <name>.
    const conflicts = [
        ...hostCredential.conflictingSettingNames,
        ...Object.keys(launchEnvironment).filter(name => isConnectorHostConflictingSettingName(name, connectionSettingName)),
    ];
    if (conflicts.length > 0) {
        return { kind: 'unsupported', reason: 'conflictingConnectionSection', settingNames: conflicts };
    }

    const setting = (key: string): string | undefined => nonWhitespace(hostCredential.connectionSettings[key]);
    const environment = (name: string): string | undefined => {
        const launchValue = getConnectorHostEnvironmentValue(launchEnvironment, name);
        return nonWhitespace(launchValue !== undefined ? launchValue : getConnectorHostEnvironmentValue(hostCredential.environment, name));
    };

    if (setting('credential')) {
        return { kind: 'unsupported', reason: 'explicitCredentialType' };
    }
    // azureCloud can change the authority the host signs in against; do not guess it.
    if (setting('azureCloud')) {
        return { kind: 'unsupported', reason: 'azureCloudSetting' };
    }

    const tenantId = setting('tenantId');
    const clientId = setting('clientId');
    const clientSecret = setting('clientSecret');
    if (tenantId && clientId && clientSecret) {
        return {
            kind: 'clientSecret',
            source: 'connectionSettings',
            tenantId,
            clientId,
            clientSecret,
            authorityHost: environment('AZURE_AUTHORITY_HOST') ?? defaultAuthorityHost,
        };
    }
    if (tenantId && clientId && setting('clientCertificate')) {
        return { kind: 'unsupported', reason: 'clientCertificate' };
    }
    if (setting('managedIdentityObjectId')) {
        return { kind: 'unsupported', reason: 'invalidConnectionSettings' };
    }

    const defaultTenantId = tenantId ?? environment('AZURE_TENANT_ID');
    const selection = environment('AZURE_TOKEN_CREDENTIALS')?.toLowerCase();
    if (selection === undefined || selection === 'dev' || selection === 'prod') {
        return { kind: 'unsupported', reason: 'defaultCredentialChain' };
    }
    if (selection === 'azureclicredential') {
        return {
            kind: 'azureCli',
            tenantId: defaultTenantId,
            environment: { ...hostCredential.environment, ...launchEnvironment },
        };
    }
    if (selection === 'environmentcredential') {
        const environmentTenantId = environment('AZURE_TENANT_ID');
        const environmentClientId = environment('AZURE_CLIENT_ID');
        const environmentClientSecret = environment('AZURE_CLIENT_SECRET');
        if (!environmentTenantId || !environmentClientId || !environmentClientSecret) {
            return { kind: 'unsupported', reason: 'environmentCredentialIncomplete' };
        }
        // DefaultAzureCredential can substitute its own TenantId; refuse to guess when they differ.
        if (tenantId && tenantId.toLowerCase() !== environmentTenantId.toLowerCase()) {
            return { kind: 'unsupported', reason: 'environmentCredentialTenantConflict' };
        }
        return {
            kind: 'clientSecret',
            source: 'environmentCredential',
            tenantId: environmentTenantId,
            clientId: environmentClientId,
            clientSecret: environmentClientSecret,
            authorityHost: environment('AZURE_AUTHORITY_HOST') ?? defaultAuthorityHost,
        };
    }
    return { kind: 'unsupported', reason: 'unsupportedTokenCredentialsSelection' };
}

/**
 * Resolves the principal the local Functions host polls as. Throws an actionable error, before any
 * access is granted, when that principal cannot be established.
 */
export async function resolveConnectorPollingPrincipal(
    context: IActionContext,
    hostCredential: ConnectorTriggerHostCredentialConfiguration,
    tokenProvider: ConnectorPollingTokenProvider,
): Promise<ConnectorTriggerPrincipal> {
    const connectionSettingName = hostCredential.connectionSettingName;
    if (hostCredential.launch?.kind === 'verifiedTask') {
        maskValue(context, hostCredential.launch.principal?.objectId);
        maskValue(context, hostCredential.launch.principal?.tenantId);
    }
    for (const value of [
        ...Object.values(hostCredential.connectionSettings),
        ...Object.values(hostCredential.environment),
        ...hostCredential.conflictingSettingNames,
    ]) {
        maskValue(context, value);
    }
    for (const [name, value] of Object.entries(hostCredential.launch?.environment ?? {})) {
        if (isConnectorHostConflictingSettingName(name, connectionSettingName)) {
            maskValue(context, name);
        }
        if (isConnectorHostCredentialVariable(name, connectionSettingName)) {
            maskValue(context, value);
        }
    }
    const plan = planConnectorHostCredential(hostCredential);
    context.telemetry.properties.connectorF5PollingCredential =
        plan.kind === 'unsupported' ? plan.reason : plan.kind === 'clientSecret' ? plan.source : plan.kind;
    if (plan.kind === 'unsupported') {
        throw new ConnectorTriggerF5SetupError(undefined, getUnsupportedMessage(plan.reason, connectionSettingName, plan.settingNames ?? []));
    }

    if (hostCredential.launch?.kind === 'verifiedTask') {
        const { principal, credentialKind } = hostCredential.launch;
        const observed = parseConnectorTaskProbeOutput(JSON.stringify({ oid: principal?.objectId, tid: principal?.tenantId }));
        const expectedKind = plan.kind === 'clientSecret' ? plan.source : plan.kind;
        if (!observed || credentialKind !== expectedKind ||
            plan.tenantId !== undefined && observed.tenantId.toLowerCase() !== plan.tenantId.toLowerCase()) {
            throw new ConnectorTriggerF5SetupError(undefined, localize(
                'connectorPollingTaskProbeInvalid',
                'The pre-launch credential probe did not identify a principal matching the local Functions host credential configuration. Run the pre-launch verification again before starting the host. No connection access was granted.',
            ));
        }
        return observed;
    }

    let token: string;
    try {
        token = plan.kind === 'clientSecret' ?
            await tokenProvider.getClientSecretToken(context, {
                tenantId: plan.tenantId,
                clientId: plan.clientId,
                clientSecret: plan.clientSecret,
                authorityHost: plan.authorityHost,
            }) :
            await tokenProvider.getAzureCliToken(context, { tenantId: plan.tenantId, environment: plan.environment });
    } catch {
        throw new ConnectorTriggerF5SetupError(undefined, plan.kind === 'azureCli' ?
            localize(
                'connectorPollingAzureCliTokenFailed',
                'AZURE_TOKEN_CREDENTIALS selects Azure CLI for the local Functions host, but Azure CLI could not get a token for Connector Trigger polling. Run "az login" (with the tenant the host uses, if any), then retry F5. No connection access was granted.',
            ) :
            localize(
                'connectorPollingClientSecretTokenFailed',
                'The client secret credential configured for the local Functions host could not get a token for Connector Trigger polling. Check the tenant, client ID and secret, then retry F5. No connection access was granted.',
            ));
    }
    maskValue(context, token);
    const principal = getTokenPrincipal(token);
    if (!principal) {
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorPollingTokenUnreadable',
            'The token for the local Functions host identity did not identify a Microsoft Entra principal. No connection access was granted.',
        ));
    }
    maskValue(context, principal.objectId);
    maskValue(context, principal.tenantId);
    return principal;
}

export function getTokenPrincipal(token: string): ConnectorTriggerPrincipal | undefined {
    const payload = token.split('.')[1];
    if (!payload) {
        return undefined;
    }
    try {
        const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (typeof claims !== 'object' || claims === null) {
            return undefined;
        }
        const { oid, tid } = claims as { oid?: unknown; tid?: unknown };
        return typeof oid === 'string' && oid && typeof tid === 'string' && tid ?
            { objectId: oid, tenantId: tid } :
            undefined;
    } catch {
        return undefined;
    }
}

/**
 * Parses the probe's complete stdout protocol. No token, extra fields, shell noise or multiple
 * observations are accepted. Callers must mask both identifiers before reporting any failure.
 */
export function parseConnectorTaskProbeOutput(output: string): ConnectorTriggerPrincipal | undefined {
    // Restrict the wire format before JSON.parse, which would otherwise silently accept duplicate keys.
    const guid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const oid = `"oid"\\s*:\\s*"${guid}"`;
    const tid = `"tid"\\s*:\\s*"${guid}"`;
    if (!new RegExp(`^\\s*\\{\\s*(?:${oid}\\s*,\\s*${tid}|${tid}\\s*,\\s*${oid})\\s*\\}\\s*$`, 'i').test(output)) {
        return undefined;
    }
    let value: unknown;
    try {
        value = JSON.parse(output);
    } catch {
        return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    return Object.keys(record).length === 2 &&
        typeof record.oid === 'string' &&
        typeof record.tid === 'string' ?
        { objectId: record.oid, tenantId: record.tid } :
        undefined;
}

/**
 * Returns true when a setting or environment variable name belongs to a configuration section the
 * WebJobs host reads for this connection instead of, or in addition to, `<name>__<key>`:
 * `AzureWebJobs<name>`, `ConnectionStrings:<name>`, `ConnectionStrings:AzureWebJobs<name>`
 * (including .NET *CONNSTR_ environment prefixes) or the colon form `<name>:<key>`.
 */
export function isConnectorHostConflictingSettingName(name: string, connectionSettingName: string): boolean {
    const raw = name.toLowerCase();
    let key = raw.replace(/__/g, ':');
    const connectionStringPrefix = connectionStringEnvironmentPrefixes.find(prefix => key.startsWith(prefix));
    if (connectionStringPrefix) {
        key = `connectionstrings:${key.slice(connectionStringPrefix.length)}`;
    }
    const connection = connectionSettingName.toLowerCase();
    const prefixed = `azurewebjobs${connection}`;
    const isSection = (section: string): boolean => key === section || key.startsWith(`${section}:`);
    return isSection(prefixed) ||
        isSection(`connectionstrings:${connection}`) ||
        isSection(`connectionstrings:${prefixed}`) ||
        raw.includes(':') && key.startsWith(`${connection}:`);
}

/** Returns true for environment variables that can change the identity the host's credential uses. */
export function isConnectorHostEnvironmentVariable(name: string): boolean {
    const upper = name.toUpperCase();
    return upper.startsWith('AZURE_') ||
        upper.startsWith('IDENTITY_') ||
        upper.startsWith('MSI_') ||
        upper === 'IMDS_ENDPOINT' ||
        azureCliEnvironmentVariables.has(upper);
}

export function isConnectorHostCredentialVariable(name: string, connectionSettingName: string): boolean {
    return isConnectorHostEnvironmentVariable(name) ||
        isConnectorHostConflictingSettingName(name, connectionSettingName) ||
        name.toLowerCase().replace(/__/g, ':').startsWith(`${connectionSettingName.toLowerCase()}:`);
}

/**
 * Reads an environment variable as the host process does: names are case-insensitive on Windows and
 * case-sensitive elsewhere.
 */
export function getConnectorHostEnvironmentValue(
    environment: HostEnvironment,
    name: string,
    ignoreCase: boolean = process.platform === 'win32',
): string | undefined {
    if (Object.hasOwn(environment, name)) {
        return environment[name];
    }
    if (!ignoreCase) {
        return undefined;
    }
    const key = Object.keys(environment).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : environment[key];
}

export const defaultConnectorPollingTokenProvider: ConnectorPollingTokenProvider = {
    async getClientSecretToken(_context, request): Promise<string> {
        if (new URL(request.authorityHost).protocol !== 'https:') {
            throw new Error('Authority host must use HTTPS.');
        }
        const { ClientSecretCredential } = await import('@azure/identity');
        const credential = new ClientSecretCredential(request.tenantId, request.clientId, request.clientSecret, {
            authorityHost: request.authorityHost,
        });
        const accessToken = await credential.getToken(connectorPollingTokenScope);
        if (!accessToken?.token) {
            throw new Error('Token request failed.');
        }
        return accessToken.token;
    },
    async getAzureCliToken(_context, request): Promise<string> {
        // Matches .NET AzureCliCredential: the same command through cmd.exe /d /c or /bin/sh -c, run
        // from the system directory with the host's PATH (or the default CLI install paths).
        // Output is never written to an output channel.
        const args = ['account', 'get-access-token', '--output', 'json', '--resource', connectorPollingTokenResource];
        if (request.tenantId) {
            if (!/^[\w.-]+$/.test(request.tenantId)) {
                throw new Error('Invalid tenant.');
            }
            args.push('--tenant', request.tenantId);
        }
        const isWindows = process.platform === 'win32';
        const environment: NodeJS.ProcessEnv = {};
        for (const [name, value] of Object.entries(request.environment)) {
            if (!(isWindows ? name.toUpperCase() === 'PATH' : name === 'PATH')) {
                environment[name] = value;
            }
        }
        environment.PATH = nonWhitespace(getConnectorHostEnvironmentValue(request.environment, 'PATH', isWindows)) ?? (isWindows ?
            ['ProgramFiles(x86)', 'ProgramFiles']
                .map(name => `${getConnectorHostEnvironmentValue(request.environment, name, true) ?? ''}\\Microsoft SDKs\\Azure\\CLI2\\wbin`)
                .join(';') :
            '/usr/bin:/usr/local/bin');
        const workingDirectory = isWindows ?
            path.join(process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows', 'System32') :
            '/bin/';
        const result = await cpUtils.tryExecuteCommand(undefined, workingDirectory, 'az', args, environment);
        if (result.code !== 0) {
            throw new Error('Azure CLI token request failed.');
        }
        const accessToken = (JSON.parse(result.cmdOutput) as { accessToken?: unknown }).accessToken;
        if (typeof accessToken !== 'string') {
            throw new Error('Azure CLI returned no token.');
        }
        return accessToken;
    },
};

function getUnsupportedMessage(
    reason: ConnectorHostCredentialUnsupportedReason,
    connectionSettingName: string,
    settingNames: readonly string[],
): string {
    const notGranted = localize('connectorPollingNotGranted', 'No connection access was granted.');
    const remedy = localize(
        'connectorPollingIdentityRemedy',
        'To let VS Code authorize the exact identity the host uses, add "AZURE_TOKEN_CREDENTIALS": "AzureCliCredential" to local.settings.json Values and sign in with "az login", or set "{0}__tenantId", "{0}__clientId" and "{0}__clientSecret". {1}',
        connectionSettingName,
        notGranted,
    );
    switch (reason) {
        case 'launchUnknown':
            return localize('connectorPollingLaunchUnknown', 'VS Code does not know how the local Functions host will be started, so it cannot verify which identity the host uses to poll Connector Triggers. {0}', notGranted);
        case 'taskLaunch':
            return localize('connectorPollingTaskLaunch', 'The local Functions host is started by a task whose shell profile, terminal settings or extensions can change the Azure identity it uses, so VS Code cannot verify that identity. {0}', notGranted);
        case 'taskEnvironmentOverride':
            return localize('connectorPollingTaskEnvironmentOverride', 'The task that starts the local Functions host sets Azure credential variables ({0}), so VS Code cannot verify which identity the host uses. Move them to local.settings.json Values. {1}', settingNames.join(', '), notGranted);
        case 'conflictingConnectionSection':
            return localize('connectorPollingConflictingSection', 'The local Functions host reads credential settings for "{0}" from {1}, which VS Code cannot verify. Remove them and use "{0}__<setting>" Values instead. {2}', connectionSettingName, settingNames.join(', '), remedy);
        case 'explicitCredentialType':
            return localize('connectorPollingCredentialTypeUnsupported', 'The "{0}__credential" setting selects a credential whose identity VS Code cannot verify locally. {1}', connectionSettingName, remedy);
        case 'azureCloudSetting':
            return localize('connectorPollingAzureCloudUnsupported', 'VS Code cannot verify the identity the host uses with the "{0}__azureCloud" setting. {1}', connectionSettingName, remedy);
        case 'clientCertificate':
            return localize('connectorPollingCertificateUnsupported', 'VS Code cannot verify the identity of the certificate credential configured for "{0}". {1}', connectionSettingName, remedy);
        case 'invalidConnectionSettings':
            return localize('connectorPollingInvalidConnectionSettings', 'The credential settings for "{0}" are not valid for the local Functions host. {1}', connectionSettingName, remedy);
        case 'environmentCredentialIncomplete':
            return localize('connectorPollingEnvironmentCredentialIncomplete', 'AZURE_TOKEN_CREDENTIALS selects EnvironmentCredential, but AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET are not all set. {0}', remedy);
        case 'environmentCredentialTenantConflict':
            return localize('connectorPollingEnvironmentCredentialTenantConflict', 'AZURE_TOKEN_CREDENTIALS selects EnvironmentCredential, but "{0}__tenantId" differs from AZURE_TENANT_ID. {1}', connectionSettingName, remedy);
        case 'unsupportedTokenCredentialsSelection':
            return localize('connectorPollingTokenCredentialsUnsupported', 'VS Code cannot verify the identity selected by AZURE_TOKEN_CREDENTIALS. {0}', remedy);
        case 'defaultCredentialChain':
        default:
            return localize('connectorPollingDefaultChainUnsupported', 'The local Functions host would use DefaultAzureCredential, whose identity depends on the developer tools and environment available to the host. {0}', remedy);
    }
}

function nonWhitespace(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function maskValue(context: IActionContext, value: string | undefined): void {
    if (value && !context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}
