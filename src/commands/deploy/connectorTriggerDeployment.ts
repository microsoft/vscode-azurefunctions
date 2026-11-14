/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ManagedServiceIdentity, type StringDictionary } from '@azure/arm-appservice';
import { createWebSiteClient, type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { getResourceGroupFromId } from '@microsoft/vscode-azext-azureutils';
import { AzExtFsExtra, nonNullProp, UserCancelledError, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ConnectionKey, extensionVersionKey, localEventHubsEmulatorConnectionRegExp, localSettingsFileName, localStorageEmulatorConnectionString, workerRuntimeKey } from '../../constants';
import { findPollingConnectorBindings, type ConnectorTriggerBindingCandidate } from '../../connectorTrigger/connectorTriggerBindings';
import { deriveConnectorPollingEndpoint } from '../../debug/connectorNamespace/connectorTriggerF5Setup';
import { ext } from '../../extensionVariables';
import { getLocalSettingsJsonwithEncryption } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { AzureConnectorGatewayClient, type ConnectorGatewayClient } from '../createFunction/connectorSteps/ConnectorGatewayClient';
import { type ConnectorGatewayResource } from '../createFunction/connectorSteps/ConnectorGatewayModels';

export const connectorManagedIdentityCredential: string = 'managedidentity';
const appInsightsConnectionStringKey: string = 'APPLICATIONINSIGHTS_CONNECTION_STRING';
const localOnlySettingNames: readonly string[] = ['AZURE_TOKEN_CREDENTIALS'];
// Deploy reconciles these for Dedicated/Consumption apps, and Flex Consumption rejects them because it uses functionAppConfig.runtime.
const platformManagedSettingNames: readonly string[] = [workerRuntimeKey, extensionVersionKey];

export interface ConnectorTriggerDeploymentTarget {
    readonly connectionSettingName: string;
    readonly triggerConfigName: string;
    readonly pollingEndpoint: string;
    /** Set when the deployed app selects a user-assigned identity with `<connection>__clientId`. */
    readonly managedIdentityClientId?: string;
}

export interface ConnectorTriggerAppSettingsResult {
    readonly changedNames: string[];
    readonly excludedNames: string[];
    readonly targets: ConnectorTriggerDeploymentTarget[];
    /** Trigger config setting names whose trigger config or polling endpoint is unknown. */
    readonly unresolvedSettingNames: string[];
    readonly storageMissing: boolean;
    readonly appInsightsMissing: boolean;
}

/**
 * Merges the app settings a Connector Trigger Poll project needs in Azure into `remote`.
 * Connector references from local.settings.json replace remote values, other local values are only added when missing,
 * and local-only credentials, emulator values and storage settings are never uploaded.
 */
export function mergeConnectorTriggerAppSettings(
    localValues: Readonly<Record<string, unknown>>,
    bindings: readonly ConnectorTriggerBindingCandidate[],
    remote: Record<string, string>,
): ConnectorTriggerAppSettingsResult {
    const changedNames = new Set<string>();
    const excludedNames: string[] = [];
    const connectionPrefixes = new Set(bindings.map(binding => `${binding.connectionSettingName}__`.toLowerCase()));
    const triggerConfigSettingNames = new Set(bindings.map(binding => binding.triggerConfigSettingName.toLowerCase()));

    const setRemote = (name: string, value: string): void => {
        const existingName = findName(remote, name) ?? name;
        if (remote[existingName] !== value) {
            remote[existingName] = value;
            changedNames.add(existingName);
        }
    };

    for (const [name, value] of Object.entries(localValues)) {
        if (typeof value !== 'string') {
            continue;
        }

        const lowerName = name.toLowerCase();
        if (platformManagedSettingNames.some(platformName => platformName.toLowerCase() === lowerName)) {
            continue;
        }

        const connectionPrefix = [...connectionPrefixes].find(prefix => lowerName.startsWith(prefix));
        if (connectionPrefix) {
            // Only the polling endpoint is shared; local credential keys (clientId, tenantId, secrets, ...) are replaced by managed identity.
            if (lowerName === `${connectionPrefix}pollingendpoint`) {
                setRemote(name, value);
            } else {
                excludedNames.push(name);
            }
        } else if (triggerConfigSettingNames.has(lowerName)) {
            setRemote(name, value);
        } else if (isLocalOnlySetting(name, value)) {
            excludedNames.push(name);
        } else if (findName(remote, name) === undefined) {
            setRemote(name, value);
        }
    }

    const targets: ConnectorTriggerDeploymentTarget[] = [];
    const unresolvedSettingNames: string[] = [];
    for (const binding of bindings) {
        setRemote(`${binding.connectionSettingName}__credential`, connectorManagedIdentityCredential);

        const triggerConfigName = getValue(remote, binding.triggerConfigSettingName);
        const pollingEndpoint = getValue(remote, `${binding.connectionSettingName}__pollingEndpoint`);
        if (!triggerConfigName || !pollingEndpoint) {
            unresolvedSettingNames.push(binding.triggerConfigSettingName);
            continue;
        }

        const managedIdentityClientId = getValue(remote, `${binding.connectionSettingName}__clientId`);
        if (!targets.some(target => equalsIgnoreCase(target.triggerConfigName, triggerConfigName) && equalsIgnoreCase(target.pollingEndpoint, pollingEndpoint))) {
            targets.push({ connectionSettingName: binding.connectionSettingName, triggerConfigName, pollingEndpoint, managedIdentityClientId });
        }
    }

    const storageMissing = !ensureStorageAccountName(remote, setRemote);
    const appInsightsMissing = !getValue(remote, appInsightsConnectionStringKey);

    return { changedNames: [...changedNames], excludedNames, targets, unresolvedSettingNames, storageMissing, appInsightsMissing };
}

/**
 * Identity-based storage written by Function App creation uses service URIs; add `AzureWebJobsStorage__accountName` like the Connector samples do.
 * @returns false when the app has no storage configuration at all
 */
function ensureStorageAccountName(remote: Record<string, string>, setRemote: (name: string, value: string) => void): boolean {
    if (getValue(remote, ConnectionKey.StorageIdentity)) {
        return true;
    }

    const blobServiceUri = getValue(remote, `${ConnectionKey.Storage}__blobServiceUri`);
    if (blobServiceUri) {
        const accountName = tryGetStorageAccountName(blobServiceUri);
        if (accountName) {
            setRemote(ConnectionKey.StorageIdentity, accountName);
        }
        return true;
    }

    return Object.keys(remote).some(name => name.toLowerCase() === ConnectionKey.Storage.toLowerCase() || name.toLowerCase().startsWith(`${ConnectionKey.Storage.toLowerCase()}__`));
}

function tryGetStorageAccountName(serviceUri: string): string | undefined {
    try {
        const accountName = new URL(serviceUri).hostname.split('.')[0];
        return /^[a-z0-9]{3,24}$/.test(accountName) ? accountName : undefined;
    } catch {
        return undefined;
    }
}

function isLocalOnlySetting(name: string, value: string): boolean {
    const lowerName = name.toLowerCase();
    return localOnlySettingNames.some(localOnlyName => localOnlyName.toLowerCase() === lowerName) ||
        // The deployed app's storage is configured with managed identity when the app is created; never replace it with local values.
        lowerName === ConnectionKey.Storage.toLowerCase() ||
        lowerName.startsWith(`${ConnectionKey.Storage.toLowerCase()}__`) ||
        value === localStorageEmulatorConnectionString ||
        (lowerName === ConnectionKey.EventHubs.toLowerCase() && localEventHubsEmulatorConnectionRegExp.test(value));
}

export interface ConnectorTriggerPrincipal {
    readonly principalId: string;
    readonly tenantId: string;
}

export type ConnectorTriggerSystemIdentityEnabler = (context: IActionContext, site: ParsedSite) => Promise<ManagedServiceIdentity | undefined>;

export interface ConnectorTriggerDeploymentDependencies {
    readonly client?: ConnectorGatewayClient;
    readonly enableSystemIdentity?: ConnectorTriggerSystemIdentityEnabler;
    readonly findBindings?: (projectPath: string) => Promise<ConnectorTriggerBindingCandidate[]>;
}

/**
 * Configures a Function App to run the project's Connector Trigger Poll functions: merges the required app settings into `appSettings`
 * (the caller uploads them) and grants each trigger config's connection access to the app's managed identity.
 * @returns true when `appSettings` changed
 */
export async function configureConnectorTriggerDeployment(
    context: IActionContext & ISubscriptionContext,
    options: { site: ParsedSite; projectPath: string; appSettings: StringDictionary },
    dependencies: ConnectorTriggerDeploymentDependencies = {},
): Promise<boolean> {
    const bindings = await (dependencies.findBindings ?? findPollingConnectorBindings)(options.projectPath);
    context.telemetry.properties.connectorTriggerDeploy = String(bindings.length > 0);
    if (bindings.length === 0) {
        return false;
    }
    context.telemetry.measurements.connectorTriggerDeployBindingCount = bindings.length;

    const { site } = options;
    const localSettingsPath = path.join(options.projectPath, localSettingsFileName);
    const localValues = await AzExtFsExtra.pathExists(localSettingsPath) ?
        (await getLocalSettingsJsonwithEncryption(context, localSettingsPath)).Values ?? {} :
        {};

    options.appSettings.properties ??= {};
    const result = mergeConnectorTriggerAppSettings(localValues, bindings, options.appSettings.properties);
    context.telemetry.measurements.connectorTriggerDeployChangedSettingCount = result.changedNames.length;
    context.telemetry.measurements.connectorTriggerDeployUnresolvedCount = result.unresolvedSettingNames.length;
    context.telemetry.properties.connectorTriggerDeployStorageMissing = String(result.storageMissing);
    context.telemetry.properties.connectorTriggerDeployAppInsightsMissing = String(result.appInsightsMissing);

    if (result.changedNames.length) {
        ext.outputChannel.appendLog(localize('connectorDeploySettings', 'Connector Trigger app settings to update: {0}', result.changedNames.join(', ')), { resourceName: site.fullName });
    }
    if (result.excludedNames.length) {
        ext.outputChannel.appendLog(localize('connectorDeployExcluded', 'Local-only Connector Trigger settings were not uploaded: {0}', result.excludedNames.join(', ')), { resourceName: site.fullName });
    }
    if (result.storageMissing) {
        ext.outputChannel.appendLog(localize('connectorDeployStorageMissing', 'WARNING: "{0}" has no "{1}" settings. Configure identity-based storage with "{2}" so the Connector Trigger host can start.', site.fullName, ConnectionKey.Storage, ConnectionKey.StorageIdentity));
    }
    if (result.appInsightsMissing) {
        ext.outputChannel.appendLog(localize('connectorDeployAppInsightsMissing', 'WARNING: "{0}" has no "{1}" app setting, so Connector Trigger executions will not be monitored.', site.fullName, appInsightsConnectionStringKey));
    }

    const warnings: string[] = [];
    if (result.unresolvedSettingNames.length) {
        warnings.push(localize(
            'connectorDeployUnresolved',
            'Connector Trigger settings "{0}" were not found in local.settings.json. Start debugging locally (F5) to create the trigger config, then deploy again to grant "{1}" access to its connection.',
            result.unresolvedSettingNames.join(', '),
            site.fullName,
        ));
    }

    if (result.targets.length) {
        warnings.push(...await grantConnectorTriggerAccess(context, site, result.targets, dependencies));
    }

    for (const warning of warnings) {
        ext.outputChannel.appendLog(`WARNING: ${warning}`, { resourceName: site.fullName });
        void context.ui.showWarningMessage(warning);
    }

    return result.changedNames.length > 0;
}

/**
 * Grants each trigger config's connection access to the Function App's managed identity, matching the samples' `connections/accessPolicies` resources.
 * @returns warnings for trigger configs that could not be found
 */
export async function grantConnectorTriggerAccess(
    context: IActionContext & ISubscriptionContext,
    site: ParsedSite,
    targets: readonly ConnectorTriggerDeploymentTarget[],
    dependencies: ConnectorTriggerDeploymentDependencies = {},
): Promise<string[]> {
    const client = dependencies.client ?? new AzureConnectorGatewayClient();
    const warnings: string[] = [];
    let namespaces: ConnectorGatewayResource[] | undefined;
    let grantedCount = 0;

    for (const target of targets) {
        context.valuesToMask.push(target.triggerConfigName, target.pollingEndpoint);
        const principal = await getConnectorTriggerPrincipal(context, site, target, dependencies);
        context.valuesToMask.push(principal.principalId);

        namespaces ??= await client.listNamespaces(context);
        const match = await findTriggerConfig(context, client, namespaces, target);
        if (!match) {
            warnings.push(localize(
                'connectorDeployTriggerNotFound',
                'Could not find Connector trigger config "{0}" in subscription "{1}", so "{2}" was not granted access to its connection. Grant the app\'s managed identity an access policy on the connection manually.',
                target.triggerConfigName,
                context.subscriptionDisplayName,
                site.fullName,
            ));
            continue;
        }

        const { namespace, resourceGroupName, connectionName } = match;
        const existing = await client.getConnectionAccessPolicy(context, resourceGroupName, namespace.name, connectionName, principal.principalId);
        if (existing) {
            if (!equalsIgnoreCase(existing.properties?.principal?.identity?.objectId, principal.principalId)) {
                throw new Error(localize(
                    'connectorDeployAccessPolicyConflict',
                    'Connection "{0}" already has an access policy named "{1}" for a different identity. It was not changed.',
                    connectionName,
                    principal.principalId,
                ));
            }
            ext.outputChannel.appendLog(localize('connectorDeployAccessExists', 'The managed identity of "{0}" already has access to Connector connection "{1}".', site.fullName, connectionName), { resourceName: site.fullName });
            continue;
        }

        ext.outputChannel.appendLog(localize('connectorDeployGranting', 'Granting the managed identity of "{0}" access to Connector connection "{1}"...', site.fullName, connectionName), { resourceName: site.fullName });
        await client.createOrUpdateConnectionAccessPolicy(context, resourceGroupName, namespace.name, connectionName, principal.principalId, {
            location: namespace.location,
            properties: {
                principal: {
                    type: 'ActiveDirectory',
                    identity: { objectId: principal.principalId, tenantId: principal.tenantId },
                },
            },
        });
        grantedCount += 1;
        ext.outputChannel.appendLog(localize('connectorDeployGranted', 'Granted the managed identity of "{0}" access to Connector connection "{1}".', site.fullName, connectionName), { resourceName: site.fullName });
    }

    context.telemetry.measurements.connectorTriggerDeployGrantedCount = grantedCount;
    context.telemetry.measurements.connectorTriggerDeployNotFoundCount = warnings.length;
    return warnings;
}

async function getConnectorTriggerPrincipal(
    context: IActionContext & ISubscriptionContext,
    site: ParsedSite,
    target: ConnectorTriggerDeploymentTarget,
    dependencies: ConnectorTriggerDeploymentDependencies,
): Promise<ConnectorTriggerPrincipal> {
    let identity = site.rawSite.identity;
    if (target.managedIdentityClientId) {
        const userAssigned = Object.values(identity?.userAssignedIdentities ?? {})
            .find(candidate => equalsIgnoreCase(candidate.clientId, target.managedIdentityClientId));
        if (!userAssigned?.principalId) {
            throw new Error(localize(
                'connectorDeployUserIdentityMissing',
                'App setting "{0}__clientId" on "{1}" does not match a user-assigned identity assigned to the app.',
                target.connectionSettingName,
                site.fullName,
            ));
        }
        return { principalId: userAssigned.principalId, tenantId: identity?.tenantId ?? context.tenantId };
    }

    if (!identity?.principalId || !identity.type?.includes('SystemAssigned')) {
        context.telemetry.properties.connectorTriggerDeployEnabledSystemIdentity = 'true';
        ext.outputChannel.appendLog(localize('connectorDeployEnablingIdentity', 'Enabling system assigned identity for "{0}" so it can access Connector connections...', site.fullName), { resourceName: site.fullName });
        identity = await (dependencies.enableSystemIdentity ?? enableSystemIdentity)(context, site);
        site.rawSite.identity = identity;
    }

    if (!identity?.principalId) {
        throw new Error(localize('connectorDeployIdentityMissing', 'Could not get the system assigned identity of "{0}".', site.fullName));
    }
    return { principalId: identity.principalId, tenantId: identity.tenantId ?? context.tenantId };
}

async function enableSystemIdentity(context: IActionContext, site: ParsedSite): Promise<ManagedServiceIdentity | undefined> {
    const client = await createWebSiteClient([context, site.subscription]);
    const identity: ManagedServiceIdentity = { ...site.rawSite.identity };
    identity.type = identity.type === 'UserAssigned' ? 'SystemAssigned, UserAssigned' : 'SystemAssigned';
    const updated = site.isSlot ?
        await client.webApps.updateSlot(site.resourceGroup, site.siteName, nonNullProp(site, 'slotName'), { identity }) :
        await client.webApps.update(site.resourceGroup, site.siteName, { identity });
    return updated.identity;
}

async function findTriggerConfig(
    context: IActionContext & ISubscriptionContext,
    client: ConnectorGatewayClient,
    namespaces: readonly ConnectorGatewayResource[],
    target: ConnectorTriggerDeploymentTarget,
): Promise<{ namespace: ConnectorGatewayResource & { name: string }; resourceGroupName: string; connectionName: string } | undefined> {
    for (const namespace of namespaces) {
        if (!namespace.id || !namespace.name) {
            continue;
        }
        const resourceGroupName = getResourceGroupFromId(namespace.id);
        let triggerConfig: Awaited<ReturnType<ConnectorGatewayClient['getTriggerConfig']>>;
        try {
            triggerConfig = await client.getTriggerConfig(context, resourceGroupName, namespace.name, target.triggerConfigName);
        } catch (error) {
            if (error instanceof UserCancelledError) {
                throw error;
            }
            // An unrelated namespace the user can't read must not block deployment
            context.telemetry.properties.connectorTriggerDeployLookupFailed = 'true';
            continue;
        }
        const receiveUri = triggerConfig?.properties?.pollingEndpoints?.receiveUri;
        const connectionName = triggerConfig?.properties?.connectionDetails?.connectionName;
        if (!receiveUri || !connectionName || !samePollingEndpoint(tryDerivePollingEndpoint(receiveUri), target.pollingEndpoint)) {
            continue;
        }

        context.valuesToMask.push(namespace.name, resourceGroupName, connectionName);
        return { namespace: { ...namespace, name: namespace.name }, resourceGroupName, connectionName };
    }
    return undefined;
}

function tryDerivePollingEndpoint(receiveUri: string): string | undefined {
    try {
        return deriveConnectorPollingEndpoint(receiveUri);
    } catch {
        return undefined;
    }
}

function samePollingEndpoint(left: string | undefined, right: string): boolean {
    return !!left && equalsIgnoreCase(left.replace(/\/+$/, ''), right.replace(/\/+$/, ''));
}

function findName(values: Readonly<Record<string, unknown>>, name: string): string | undefined {
    return Object.keys(values).find(key => equalsIgnoreCase(key, name));
}

function getValue(values: Readonly<Record<string, string>>, name: string): string | undefined {
    const key = findName(values, name);
    return key === undefined ? undefined : values[key] || undefined;
}

function equalsIgnoreCase(left: string | undefined, right: string | undefined): boolean {
    return left !== undefined && right !== undefined && left.toLowerCase() === right.toLowerCase();
}
