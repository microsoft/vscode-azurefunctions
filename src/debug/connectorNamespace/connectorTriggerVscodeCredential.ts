/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureSubscription } from '@microsoft/vscode-azext-azureauth';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type ILocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { getConnectorTriggerSettingValue } from './ConnectorTriggerLocalSettingsWriter';
import { azdTokenCredentialName } from './connectorTriggerAzdAuthServer';
import {
    ConnectorTriggerF5SetupError,
    type ConnectorTriggerHostCredentialConfiguration,
    type ConnectorTriggerPrincipal,
} from './connectorTriggerF5Contracts';
import { getConnectorHostEnvironmentValue, getTokenPrincipal } from './connectorTriggerHostCredential';

export const tokenCredentialsSetting = 'AZURE_TOKEN_CREDENTIALS';

/**
 * Whether the host's default credential can use the Azure Resources sign-in: AzureDeveloperCliCredential reaches it
 * through the azd external authentication server that F5 starts. True when no other credential is configured.
 */
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
        return selection.trim().toLowerCase() === azdTokenCredentialName.toLowerCase();
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
    // The azd authentication server returns tokens from this same Azure Resources account and tenant.
    if (session.account.id !== subscription.account.id ||
        !principal || !sameTenant(principal.tenantId) ||
        configuredTenant !== undefined && !sameTenant(configuredTenant)) {
        context.telemetry.properties.connectorF5VscodeIdentityMatches = 'false';
        throw new ConnectorTriggerF5SetupError(undefined, localize(
            'connectorVscodeAccountMismatch',
            'The Azure Resources sign-in or the configured tenant does not match the selected subscription. Sign in to Azure Resources with the account the local host should use, select its subscription again, and retry F5. No connection access was granted.',
        ));
    }
    mask(context, principal.objectId, principal.tenantId);
    context.telemetry.properties.connectorF5VscodeIdentityMatches = 'true';
    return principal;
}

function mask(context: IActionContext, ...values: string[]): void {
    for (const value of values) {
        if (value && !context.valuesToMask.includes(value)) {
            context.valuesToMask.push(value);
        }
    }
}
