/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHttpHeaders } from '@azure/core-rest-pipeline';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { cpUtils } from '../../utils/cpUtils';
import { requestUtils } from '../../utils/requestUtils';
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

/**
 * The credential the local Functions host will build, limited to the cases whose principal VS Code
 * can establish by acquiring a token with the same inputs.
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
    }
    | {
        kind: 'unsupported';
        reason: ConnectorHostCredentialUnsupportedReason;
    };

export type ConnectorHostCredentialUnsupportedReason =
    | 'explicitCredentialType'
    | 'prefixedConnectionSection'
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
        request: { tenantId?: string; environment: NodeJS.ProcessEnv },
    ): Promise<string>;
}

/**
 * Mirrors the credential the Connector extension builds for Poll delivery:
 * Microsoft.Extensions.Azure 1.13.1 `ClientFactory.CreateCredential` on the connection section, falling
 * back to the .NET Azure.Identity 1.17.1 `DefaultAzureCredential` (with `TenantId` from the
 * connection section or AZURE_TENANT_ID). The .NET chain differs from the JavaScript SDK chain and
 * depends on developer tools available to the host process, so an unpinned chain is never guessed.
 *
 * Process environment values take precedence over local.settings.json Values, matching Core Tools.
 */
export function planConnectorHostCredential(
    hostCredential: ConnectorTriggerHostCredentialConfiguration,
    processEnvironment: NodeJS.ProcessEnv,
): ConnectorHostCredentialPlan {
    const setting = (key: string): string | undefined => nonWhitespace(hostCredential.connectionSettings[key]);
    const environment = (name: string): string | undefined =>
        nonWhitespace(processEnvironment[name]) ?? nonWhitespace(hostCredential.environment[name]);

    if (setting('credential')) {
        return { kind: 'unsupported', reason: 'explicitCredentialType' };
    }
    // The WebJobs host reads an AzureWebJobs<name> section before <name>.
    const prefixedSection = `AzureWebJobs${hostCredential.connectionSettingName}`.toLowerCase();
    if (Object.keys(processEnvironment).some(name => {
        const lower = name.toLowerCase();
        return lower === prefixedSection || lower.startsWith(`${prefixedSection}__`);
    })) {
        return { kind: 'unsupported', reason: 'prefixedConnectionSection' };
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
        return { kind: 'azureCli', tenantId: defaultTenantId };
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
    processEnvironment: NodeJS.ProcessEnv,
    tokenProvider: ConnectorPollingTokenProvider,
): Promise<ConnectorTriggerPrincipal> {
    for (const value of [
        ...Object.values(hostCredential.connectionSettings),
        ...Object.values(hostCredential.environment),
    ]) {
        maskValue(context, value);
    }
    const plan = planConnectorHostCredential(hostCredential, processEnvironment);
    context.telemetry.properties.connectorF5PollingCredential =
        plan.kind === 'unsupported' ? plan.reason : plan.kind === 'clientSecret' ? plan.source : plan.kind;
    if (plan.kind === 'unsupported') {
        throw new ConnectorTriggerF5SetupError(undefined, getUnsupportedMessage(plan.reason, hostCredential.connectionSettingName));
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
            await tokenProvider.getAzureCliToken(context, {
                tenantId: plan.tenantId,
                environment: { ...hostCredential.environment, ...processEnvironment },
            });
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

export const defaultConnectorPollingTokenProvider: ConnectorPollingTokenProvider = {
    async getClientSecretToken(context, request): Promise<string> {
        const authority = new URL(request.authorityHost);
        if (authority.protocol !== 'https:') {
            throw new Error('Authority host must use HTTPS.');
        }
        const url = new URL(`${encodeURIComponent(request.tenantId)}/oauth2/v2.0/token`, authority.href.endsWith('/') ? authority.href : `${authority.href}/`);
        const response = await requestUtils.sendRequestWithExtTimeout(context, {
            method: 'POST',
            url: url.toString(),
            headers: createHttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: request.clientId,
                client_secret: request.clientSecret,
                scope: connectorPollingTokenScope,
            }).toString(),
        });
        const accessToken = (response.parsedBody as { access_token?: unknown } | undefined)?.access_token;
        if (response.status !== 200 || typeof accessToken !== 'string') {
            throw new Error('Token request failed.');
        }
        return accessToken;
    },
    async getAzureCliToken(_context, request): Promise<string> {
        // Same command as .NET AzureCliCredential; output is never written to an output channel.
        const args = ['account', 'get-access-token', '--output', 'json', '--resource', connectorPollingTokenResource];
        if (request.tenantId) {
            if (!/^[\w.-]+$/.test(request.tenantId)) {
                throw new Error('Invalid tenant.');
            }
            args.push('--tenant', request.tenantId);
        }
        const result = await cpUtils.tryExecuteCommand(undefined, undefined, 'az', args, request.environment);
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

function getUnsupportedMessage(reason: ConnectorHostCredentialUnsupportedReason, connectionSettingName: string): string {
    const remedy = localize(
        'connectorPollingIdentityRemedy',
        'To let VS Code authorize the exact identity the host uses, add "AZURE_TOKEN_CREDENTIALS": "AzureCliCredential" to local.settings.json Values and sign in with "az login", or set "{0}__tenantId", "{0}__clientId" and "{0}__clientSecret". No connection access was granted.',
        connectionSettingName,
    );
    switch (reason) {
        case 'explicitCredentialType':
            return localize('connectorPollingCredentialTypeUnsupported', 'The "{0}__credential" setting selects a credential whose identity VS Code cannot verify locally. {1}', connectionSettingName, remedy);
        case 'azureCloudSetting':
            return localize('connectorPollingAzureCloudUnsupported', 'VS Code cannot verify the identity the host uses with the "{0}__azureCloud" setting. {1}', connectionSettingName, remedy);
        case 'prefixedConnectionSection':
            return localize('connectorPollingPrefixedSectionUnsupported', 'The environment defines "AzureWebJobs{0}" settings, which the host reads instead of "{0}". Remove them. {1}', connectionSettingName, remedy);
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
