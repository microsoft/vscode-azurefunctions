/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureSubscription } from '@microsoft/vscode-azext-azureauth';
import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as os from 'os';
import * as path from 'path';
import { type ILocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { getConnectorTriggerSettingValue } from './ConnectorTriggerLocalSettingsWriter';
import {
    ConnectorTriggerF5SetupError,
    type ConnectorTriggerHostCredentialConfiguration,
    type ConnectorTriggerPrincipal,
} from './connectorTriggerF5Contracts';
import { getConnectorHostEnvironmentValue, getTokenPrincipal } from './connectorTriggerHostCredential';

export const vscodeTokenCredentialName = 'VisualStudioCodeCredential';
export const tokenCredentialsSetting = 'AZURE_TOKEN_CREDENTIALS';

export function usesConnectorVscodeCredential(
    connectionSettingName: string,
    settings: ILocalSettingsJson,
    environment: Readonly<Record<string, string | undefined>>,
): boolean {
    const values = settings.Values ?? {};
    const setting = (name: string): string | undefined =>
        getConnectorHostEnvironmentValue(environment, name) ?? getConnectorTriggerSettingValue(values, name);
    if (['credential', 'clientId', 'clientSecret', 'clientCertificate', 'azureCloud']
        .some(name => setting(`${connectionSettingName}__${name}`) !== undefined)) {
        return false;
    }
    const selection = setting(tokenCredentialsSetting);
    if (selection !== undefined) {
        return selection.trim().toLowerCase() === vscodeTokenCredentialName.toLowerCase();
    }

    return ![
        `${connectionSettingName}__credential`,
        `${connectionSettingName}__clientId`,
        `${connectionSettingName}__clientSecret`,
        `${connectionSettingName}__clientCertificate`,
        'AZURE_CLIENT_ID',
        'AZURE_CLIENT_SECRET',
        'AZURE_CLIENT_CERTIFICATE_PATH',
        'AZURE_FEDERATED_TOKEN_FILE',
        'IDENTITY_ENDPOINT',
        'MSI_ENDPOINT',
    ].some(name => setting(name) !== undefined);
}

export async function resolveConnectorVscodePrincipal(
    context: IActionContext,
    subscription: Pick<AzureSubscription, 'account' | 'authentication' | 'tenantId' | 'environment'>,
    hostCredential: ConnectorTriggerHostCredentialConfiguration,
): Promise<ConnectorTriggerPrincipal> {
    if (hostCredential.launch?.kind === 'task' &&
        (hostCredential.launch.execution === 'custom' || !hostCredential.launch.standardFunctionsTask)) {
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorVscodeCustomLaunchUnsupported',
            'The custom host task does not expose a verifiable local VS Code credential environment. Use the standard Functions host task or configure the Connector Trigger explicitly. No Azure resources or connection access were changed.',
        ));
    }
    if (hostCredential.conflictingSettingNames.length > 0 ||
        Object.keys(hostCredential.connectionSettings).some(name => name !== 'tenantId')) {
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorVscodeConnectionCredentialConflict',
            'An explicit connection credential or connection-string section overrides the VS Code credential. Keep the existing credential, or review and remove that conflicting configuration before selecting VS Code authentication. No settings or connection access were changed.',
        ));
    }
    mask(context, subscription.account.id, subscription.account.label, subscription.tenantId);
    const environment = { ...hostCredential.environment, ...hostCredential.launch?.environment };
    const home = (process.platform === 'win32' ? environment.USERPROFILE : environment.HOME) ?? os.homedir();
    mask(context, home);
    const record = await readAuthenticationRecord(home);
    if (!record) {
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorVscodeAuthenticationRecordMissing',
            'Azure Resources has not provided a VS Code authentication record in the local Functions host environment. Sign in through Azure Resources in that environment, then retry F5. No connection access was granted.',
        ));
    }
    for (const value of Object.values(record)) {
        if (typeof value === 'string') {
            mask(context, value);
        }
    }
    let session;
    try {
        session = await subscription.authentication.getSession();
    } catch {
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorVscodeSignInRequired',
            'The selected Azure Resources account has no usable VS Code sign-in. Sign in through Azure Resources, then retry F5. No connection access was granted.',
        ));
    }
    if (!session) {
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorVscodeSignInRequired',
            'The selected Azure Resources account has no usable VS Code sign-in. Sign in through Azure Resources, then retry F5. No connection access was granted.',
        ));
    }
    mask(context, session.accessToken, session.account.id, session.account.label);
    const principal = getTokenPrincipal(session.accessToken);
    const configuredTenant = hostCredential.connectionSettings.tenantId;
    const sameTenant = (value: unknown): boolean =>
        typeof value === 'string' && value.toLowerCase() === subscription.tenantId.toLowerCase();
    const authority = getAuthorityHost(record.authority);
    const selectedAuthority = getAuthorityHost(subscription.environment.activeDirectoryEndpointUrl);
    const hostAuthority = getAuthorityHost(
        getConnectorHostEnvironmentValue(environment, 'AZURE_AUTHORITY_HOST') ?? 'https://login.microsoftonline.com/');
    if (record.homeAccountId !== subscription.account.id ||
        record.homeAccountId !== session.account.id ||
        typeof record.tenantId !== 'string' || !record.tenantId.trim() ||
        !principal || !sameTenant(principal.tenantId) ||
        configuredTenant !== undefined && !sameTenant(configuredTenant) ||
        !authority || authority !== selectedAuthority || hostAuthority !== selectedAuthority) {
        context.telemetry.properties.connectorF5VscodeIdentityMatches = 'false';
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorVscodeAccountMismatch',
            'The VS Code broker account, tenant, or cloud does not match the selected Azure Resources subscription. Sign in to Azure Resources with the account the local host should use, select its subscription again, and retry F5. No connection access was granted.',
        ));
    }
    mask(context, principal.objectId, principal.tenantId);
    context.telemetry.properties.connectorF5VscodeIdentityMatches = 'true';
    return principal;
}

async function readAuthenticationRecord(home: string): Promise<Record<string, unknown> | undefined> {
    for (const folder of ['.azure', '.Azure']) {
        const file = path.join(home, folder, 'ms-azuretools.vscode-azureresourcegroups', 'authRecord.json');
        if (!await AzExtFsExtra.pathExists(file)) {
            continue;
        }
        try {
            const record: unknown = await AzExtFsExtra.readJSON(file);
            return record && typeof record === 'object' && !Array.isArray(record) ?
                record as Record<string, unknown> : undefined;
        } catch {
            throw new ConnectorTriggerF5SetupError(undefined, localize(
                'connectorVscodeAuthenticationRecordInvalid',
                'The local Functions host cannot read the VS Code authentication record. Sign in again through Azure Resources, then retry F5. No connection access was granted.',
            ));
        }
    }
    return undefined;
}

function getAuthorityHost(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    try {
        const url = new URL(value.includes('://') ? value : `https://${value}`);
        if (url.protocol !== 'https:') {
            return undefined;
        }
        const host = url.hostname.toLowerCase();
        return host === 'login.windows.net' ? 'login.microsoftonline.com' : host;
    } catch {
        return undefined;
    }
}

function mask(context: IActionContext, ...values: string[]): void {
    for (const value of values) {
        if (value && !context.valuesToMask.includes(value)) {
            context.valuesToMask.push(value);
        }
    }
}
