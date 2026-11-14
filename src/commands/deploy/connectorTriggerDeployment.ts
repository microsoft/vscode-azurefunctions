/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ManagedServiceIdentity, type StringDictionary } from '@azure/arm-appservice';
import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { AzExtFsExtra, AzureWizard, createSubscriptionContext, UserCancelledError, type IActionContext, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ConnectionKey, extensionVersionKey, localEventHubsEmulatorConnectionRegExp, localSettingsFileName, localStorageEmulatorConnectionString, workerRuntimeKey } from '../../constants';
import { findPollingConnectorBindings, type ConnectorTriggerBindingCandidate } from '../../connectorTrigger/connectorTriggerBindings';
import { AzureConnectorTriggerGatewayAdapter, getAccountId } from '../../debug/connectorNamespace/AzureConnectorTriggerF5Adapters';
import { type ConnectorTriggerConfig, type ConnectorTriggerConnection, type ConnectorTriggerNamespace, type ConnectorTriggerPrincipal, type ConnectorTriggerSubscriptionScope } from '../../debug/connectorNamespace/connectorTriggerF5Contracts';
import { deriveConnectorPollingEndpoint } from '../../debug/connectorNamespace/connectorTriggerF5Setup';
import { isConnectorHostCredentialVariable } from '../../debug/connectorNamespace/connectorTriggerHostCredential';
import { ext } from '../../extensionVariables';
import { getLocalSettingsJsonwithEncryption } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { createActivityContext } from '../../utils/activityUtils';
import { EnableSystemIdentityAssignStep } from '../identity/EnableSystemIdentityStep';
import { type ManagedIdentityAssignContext } from '../identity/ManagedIdentityAssignContext';

export const connectorManagedIdentityCredential: string = 'managedidentity';
const appInsightsConnectionStringKey: string = 'APPLICATIONINSIGHTS_CONNECTION_STRING';
// Deploy reconciles these for Dedicated/Consumption apps, and Flex Consumption rejects them because it uses functionAppConfig.runtime.
const platformManagedSettingNames: readonly string[] = [workerRuntimeKey, extensionVersionKey];
// Microsoft.Extensions.Azure selects a user-assigned identity with any one of these connection keys.
const identitySelectorKeys = ['clientId', 'managedIdentityClientId', 'managedIdentityResourceId', 'managedIdentityObjectId'] as const;

export interface ConnectorTriggerIdentitySelector {
    readonly settingName: string;
    readonly key: typeof identitySelectorKeys[number];
    readonly value: string;
}

export interface ConnectorTriggerDeploymentTarget {
    readonly connectionSettingName: string;
    readonly triggerConfigName: string;
    readonly pollingEndpoint: string;
    /** User-assigned identity selectors set on the deployed app; empty selects the system identity. */
    readonly identitySelectors: readonly ConnectorTriggerIdentitySelector[];
}

export interface ConnectorTriggerAppSettingsResult {
    readonly changedNames: string[];
    readonly excludedNames: string[];
    /** Local trigger references that differ from, and were not uploaded over, the app's own. */
    readonly keptNames: string[];
    readonly targets: ConnectorTriggerDeploymentTarget[];
    /** Trigger config setting names whose trigger config or polling endpoint is unknown. */
    readonly unresolvedSettingNames: string[];
    readonly storageMissing: boolean;
    readonly appInsightsMissing: boolean;
}

/**
 * Merges the app settings a Connector Trigger Poll project needs in Azure into `remote`.
 * Local values, including the trigger config and polling endpoint created by F5, are only added when the app lacks them,
 * and local-only credentials, emulator values and storage settings are never uploaded.
 */
export function mergeConnectorTriggerAppSettings(
    localValues: Readonly<Record<string, unknown>>,
    bindings: readonly ConnectorTriggerBindingCandidate[],
    remote: Record<string, string>,
): ConnectorTriggerAppSettingsResult {
    const changedNames = new Set<string>();
    const excludedNames: string[] = [];
    const keptNames: string[] = [];
    const connectionPrefixes = new Set(bindings.map(binding => `${binding.connectionSettingName}__`.toLowerCase()));
    const triggerConfigSettingNames = new Set(bindings.map(binding => binding.triggerConfigSettingName.toLowerCase()));

    const setRemote = (name: string, value: string): void => {
        const existingName = findName(remote, name) ?? name;
        if (remote[existingName] !== value) {
            remote[existingName] = value;
            changedNames.add(existingName);
        }
    };
    const setReference = (name: string, value: string): void => {
        const remoteValue = getValue(remote, name);
        if (!remoteValue) {
            setRemote(name, value);
        } else if (remoteValue !== value) {
            keptNames.push(name);
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
                setReference(name, value);
            } else {
                excludedNames.push(name);
            }
        } else if (triggerConfigSettingNames.has(lowerName)) {
            setReference(name, value);
        } else if (bindings.some(binding => isConnectorHostCredentialVariable(name, binding.connectionSettingName)) || isLocalOnlySetting(name, value)) {
            // Developer credentials (AZURE_*, AzureWebJobs<connection>__*, ConnectionStrings:<connection>, ...) would override the managed identity in Azure
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

        const identitySelectors = getIdentitySelectors(remote, binding.connectionSettingName);
        const identityKey = getIdentitySelectorKey(identitySelectors);
        if (!targets.some(target => equalsIgnoreCase(target.triggerConfigName, triggerConfigName)
            && equalsIgnoreCase(target.pollingEndpoint, pollingEndpoint)
            && getIdentitySelectorKey(target.identitySelectors) === identityKey)) {
            targets.push({ connectionSettingName: binding.connectionSettingName, triggerConfigName, pollingEndpoint, identitySelectors });
        }
    }

    const storageMissing = !ensureStorageAccountName(remote, setRemote);
    const appInsightsMissing = !getValue(remote, appInsightsConnectionStringKey);

    return { changedNames: [...changedNames], excludedNames, keptNames, targets, unresolvedSettingNames, storageMissing, appInsightsMissing };
}

function getIdentitySelectors(remote: Readonly<Record<string, string>>, connectionSettingName: string): ConnectorTriggerIdentitySelector[] {
    const selectors: ConnectorTriggerIdentitySelector[] = [];
    for (const key of identitySelectorKeys) {
        const settingName = `${connectionSettingName}__${key}`;
        const value = getValue(remote, settingName);
        if (value) {
            selectors.push({ settingName: findName(remote, settingName) ?? settingName, key, value });
        }
    }
    return selectors;
}

function getIdentitySelectorKey(selectors: readonly ConnectorTriggerIdentitySelector[]): string {
    return selectors.map(selector => `${selector.key}=${selector.value.toLowerCase()}`).join(';');
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
    // The deployed app's storage is configured with managed identity when the app is created; never replace it with local values.
    return lowerName === ConnectionKey.Storage.toLowerCase() ||
        lowerName.startsWith(`${ConnectionKey.Storage.toLowerCase()}__`) ||
        value === localStorageEmulatorConnectionString ||
        (lowerName === ConnectionKey.EventHubs.toLowerCase() && localEventHubsEmulatorConnectionRegExp.test(value));
}

export type ConnectorTriggerSystemIdentityEnabler = (context: IActionContext, site: ParsedSite) => Promise<ManagedServiceIdentity | undefined>;

export type ConnectorTriggerDeploymentGateway = Pick<AzureConnectorTriggerGatewayAdapter, 'listNamespaces' | 'getTriggerConfig' | 'ensureConnectionAccessForPrincipal'>;

export interface ConnectorTriggerDeploymentDependencies {
    readonly gateway?: ConnectorTriggerDeploymentGateway;
    readonly enableSystemIdentity?: ConnectorTriggerSystemIdentityEnabler;
    readonly findBindings?: (projectPath: string) => Promise<ConnectorTriggerBindingCandidate[]>;
    /** Subscriptions, besides the app's, that may contain the trigger config. Defaults to the Azure Resources subscription filter. */
    readonly listSubscriptionScopes?: () => Promise<ISubscriptionContext[]>;
}

/**
 * Configures a Function App to run the project's Connector Trigger Poll functions: merges the required app settings into `appSettings`
 * (the caller uploads them) and grants each trigger config's connection access to the app's managed identity.
 * Throws before changing anything in Azure when a trigger config can't be found, so deploy never leaves an app that can't poll.
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
    context.telemetry.measurements.connectorTriggerDeployKeptReferenceCount = result.keptNames.length;
    context.telemetry.measurements.connectorTriggerDeployChangedSettingCount = result.changedNames.length;
    context.telemetry.measurements.connectorTriggerDeployUnresolvedCount = result.unresolvedSettingNames.length;
    context.telemetry.properties.connectorTriggerDeployStorageMissing = String(result.storageMissing);
    context.telemetry.properties.connectorTriggerDeployAppInsightsMissing = String(result.appInsightsMissing);

    if (result.unresolvedSettingNames.length) {
        throw new Error(localize(
            'connectorDeployUnresolved',
            'Connector Trigger settings "{0}" were not found in local.settings.json or on "{1}". Start debugging locally (F5) to create the trigger config, then deploy again.',
            result.unresolvedSettingNames.join(', '),
            site.fullName,
        ));
    }

    if (result.changedNames.length) {
        ext.outputChannel.appendLog(localize('connectorDeploySettings', 'Connector Trigger app settings to update: {0}', result.changedNames.join(', ')), { resourceName: site.fullName });
    }
    if (result.keptNames.length) {
        ext.outputChannel.appendLog(localize('connectorDeployKept', 'Kept the Connector Trigger settings already on the app instead of the local values: {0}', result.keptNames.join(', ')), { resourceName: site.fullName });
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

    await grantConnectorTriggerAccess(context, site, result.targets, dependencies);
    return result.changedNames.length > 0;
}

interface TriggerConfigMatch {
    readonly scope: ConnectorTriggerSubscriptionScope;
    readonly namespace: ConnectorTriggerNamespace;
    readonly connection: Pick<ConnectorTriggerConnection, 'name'>;
}

/**
 * Grants each trigger config's connection access to the Function App's managed identity, matching the samples' `connections/accessPolicies` resources.
 * Every trigger config is found first, in the app's subscription and then the other selected subscriptions in the same tenant,
 * so a missing one fails before the app's identity or any access policy changes.
 */
export async function grantConnectorTriggerAccess(
    context: IActionContext & ISubscriptionContext,
    site: ParsedSite,
    targets: readonly ConnectorTriggerDeploymentTarget[],
    dependencies: ConnectorTriggerDeploymentDependencies = {},
): Promise<void> {
    if (targets.length === 0) {
        return;
    }

    const gateway = dependencies.gateway ?? new AzureConnectorTriggerGatewayAdapter();
    const searcher = new TriggerConfigSearcher(context, gateway, dependencies);
    const matches: TriggerConfigMatch[] = [];
    const missing: string[] = [];
    for (const target of targets) {
        context.valuesToMask.push(target.triggerConfigName, target.pollingEndpoint);
        const match = await searcher.find(target);
        if (match) {
            matches.push(match);
        } else {
            missing.push(target.triggerConfigName);
        }
    }
    context.telemetry.measurements.connectorTriggerDeployNotFoundCount = missing.length;
    context.telemetry.measurements.connectorTriggerDeployCrossSubscriptionCount = matches.filter(match => match.scope.subscription.id !== context.subscriptionId).length;
    if (missing.length) {
        throw new Error(localize(
            'connectorDeployTriggerNotFound',
            'Could not find Connector trigger config "{0}" in the subscriptions selected in Azure Resources, so "{1}" could not be granted access to its connection. Select the subscription that contains the trigger config, or start debugging locally (F5) to create it, then deploy again.',
            missing.join(', '),
            site.fullName,
        ));
    }

    let grantedCount = 0;
    for (const [index, target] of targets.entries()) {
        const { scope, namespace, connection } = matches[index];
        const principal = await getConnectorTriggerPrincipal(context, site, target, dependencies);
        context.valuesToMask.push(principal.objectId);

        ext.outputChannel.appendLog(localize('connectorDeployGranting', 'Granting the managed identity of "{0}" access to Connector connection "{1}"...', site.fullName, connection.name), { resourceName: site.fullName });
        // Name a new policy after the principal, like the samples' Bicep, so redeploys reuse it
        await gateway.ensureConnectionAccessForPrincipal(context, scope, namespace, connection, {
            name: principal.objectId,
            principal: { type: 'ActiveDirectory', identity: principal },
        });
        grantedCount += 1;
        ext.outputChannel.appendLog(localize('connectorDeployGranted', 'The managed identity of "{0}" has access to Connector connection "{1}".', site.fullName, connection.name), { resourceName: site.fullName });
    }
    context.telemetry.measurements.connectorTriggerDeployGrantedCount = grantedCount;
}

class TriggerConfigSearcher {
    private readonly appScope: ConnectorTriggerSubscriptionScope;
    private otherScopes: ConnectorTriggerSubscriptionScope[] | undefined;
    private readonly namespaces = new Map<string, Promise<ConnectorTriggerNamespace[]>>();

    public constructor(
        private readonly context: IActionContext & ISubscriptionContext,
        private readonly gateway: ConnectorTriggerDeploymentGateway,
        private readonly dependencies: ConnectorTriggerDeploymentDependencies,
    ) {
        this.appScope = getSubscriptionScope(context);
    }

    public async find(target: ConnectorTriggerDeploymentTarget): Promise<TriggerConfigMatch | undefined> {
        // The polling endpoint doesn't identify the subscription, and F5 may have used a different one than the app
        const match = await this.findIn(this.appScope, target);
        if (match) {
            return match;
        }
        for (const scope of await this.getOtherScopes()) {
            const otherMatch = await this.findIn(scope, target);
            if (otherMatch) {
                return otherMatch;
            }
        }
        return undefined;
    }

    private async findIn(scope: ConnectorTriggerSubscriptionScope, target: ConnectorTriggerDeploymentTarget): Promise<TriggerConfigMatch | undefined> {
        const match = await findTriggerConfig(this.context, this.gateway, scope, await this.listNamespaces(scope), target);
        return match && { scope, ...match };
    }

    private async getOtherScopes(): Promise<ConnectorTriggerSubscriptionScope[]> {
        if (!this.otherScopes) {
            const accountId = getAccountId(this.context);
            const subscriptions = await (this.dependencies.listSubscriptionScopes ?? listSelectedSubscriptions)();
            this.otherScopes = subscriptions
                .filter(subscription => subscription.subscriptionId !== this.context.subscriptionId
                    && equalsIgnoreCase(subscription.tenantId, this.context.tenantId)
                    && subscription.environment.name === this.context.environment.name
                    && (!accountId || getAccountId(subscription) === accountId))
                .map(getSubscriptionScope);
        }
        return this.otherScopes;
    }

    private async listNamespaces(scope: ConnectorTriggerSubscriptionScope): Promise<ConnectorTriggerNamespace[]> {
        const subscriptionId = scope.subscription.id;
        let namespaces = this.namespaces.get(subscriptionId);
        if (!namespaces) {
            namespaces = this.gateway.listNamespaces(this.context, scope).catch(error => {
                // The app's own subscription must be readable; another selected subscription the user can't read is skipped
                if (error instanceof UserCancelledError || subscriptionId === this.context.subscriptionId) {
                    throw error;
                }
                this.context.telemetry.properties.connectorTriggerDeployNamespaceListFailed = 'true';
                return [];
            });
            this.namespaces.set(subscriptionId, namespaces);
        }
        return await namespaces;
    }
}

async function listSelectedSubscriptions(): Promise<ISubscriptionContext[]> {
    return (await ext.rgApi.getSubscriptions(true)).map(subscription => createSubscriptionContext(subscription));
}

function getSubscriptionScope(context: ISubscriptionContext): ConnectorTriggerSubscriptionScope {
    return {
        subscription: {
            id: context.subscriptionId,
            tenantId: context.tenantId,
            accountId: getAccountId(context),
            environment: {
                name: context.environment.name,
                resourceManagerEndpointUrl: context.environment.resourceManagerEndpointUrl,
            },
        },
    };
}

async function getConnectorTriggerPrincipal(
    context: IActionContext & ISubscriptionContext,
    site: ParsedSite,
    target: ConnectorTriggerDeploymentTarget,
    dependencies: ConnectorTriggerDeploymentDependencies,
): Promise<ConnectorTriggerPrincipal> {
    let identity = site.rawSite.identity;
    if (target.identitySelectors.length > 1) {
        throw new Error(localize(
            'connectorDeployMultipleIdentitySelectors',
            'Connection "{0}" on "{1}" selects a user-assigned identity with more than one setting ({2}). Keep only one.',
            target.connectionSettingName,
            site.fullName,
            target.identitySelectors.map(selector => selector.settingName).join(', '),
        ));
    }

    const selector = target.identitySelectors[0];
    if (selector) {
        const userAssigned = Object.entries(identity?.userAssignedIdentities ?? {})
            .find(([resourceId, candidate]) => {
                switch (selector.key) {
                    case 'managedIdentityResourceId':
                        return equalsIgnoreCase(resourceId, selector.value);
                    case 'managedIdentityObjectId':
                        return equalsIgnoreCase(candidate.principalId, selector.value);
                    default:
                        return equalsIgnoreCase(candidate.clientId, selector.value);
                }
            })?.[1];
        context.telemetry.properties.connectorTriggerDeployIdentitySelector = selector.key;
        if (!userAssigned?.principalId) {
            throw new Error(localize(
                'connectorDeployUserIdentityMissing',
                'App setting "{0}" on "{1}" does not match a user-assigned identity assigned to the app.',
                selector.settingName,
                site.fullName,
            ));
        }
        return { objectId: userAssigned.principalId, tenantId: identity?.tenantId ?? context.tenantId };
    }

    if (!identity?.principalId || !identity.type?.includes('SystemAssigned')) {
        context.telemetry.properties.connectorTriggerDeployEnabledSystemIdentity = 'true';
        identity = await (dependencies.enableSystemIdentity ?? enableSystemIdentity)(context, site);
        site.rawSite.identity = identity;
    }

    if (!identity?.principalId) {
        throw new Error(localize('connectorDeployIdentityMissing', 'Could not get the system assigned identity of "{0}".', site.fullName));
    }
    return { objectId: identity.principalId, tenantId: identity.tenantId ?? context.tenantId };
}

async function enableSystemIdentity(context: IActionContext & ISubscriptionContext, site: ParsedSite): Promise<ManagedServiceIdentity | undefined> {
    const wizardContext: ManagedIdentityAssignContext = {
        ...context,
        site,
        ...(await createActivityContext()),
        activityTitle: localize('connectorDeployEnableIdentity', 'Enable system assigned identity for "{0}"', site.fullName),
    };
    await new AzureWizard(wizardContext, { executeSteps: [new EnableSystemIdentityAssignStep()] }).execute();
    return site.rawSite.identity;
}

async function findTriggerConfig(
    context: IActionContext,
    gateway: ConnectorTriggerDeploymentGateway,
    scope: ConnectorTriggerSubscriptionScope,
    namespaces: readonly ConnectorTriggerNamespace[],
    target: ConnectorTriggerDeploymentTarget,
): Promise<{ namespace: ConnectorTriggerNamespace; connection: Pick<ConnectorTriggerConnection, 'name'> } | undefined> {
    for (const namespace of namespaces) {
        let triggerConfig: ConnectorTriggerConfig | undefined;
        try {
            triggerConfig = await gateway.getTriggerConfig(context, scope, namespace, target.triggerConfigName);
        } catch (error) {
            if (error instanceof UserCancelledError) {
                throw error;
            }
            // An unrelated namespace the user can't read must not block deployment
            context.telemetry.properties.connectorTriggerDeployLookupFailed = 'true';
            continue;
        }
        const connectionName = triggerConfig?.connectionName;
        if (!triggerConfig || !connectionName || !samePollingEndpoint(tryDerivePollingEndpoint(triggerConfig.pollingEndpoints.receiveUri), target.pollingEndpoint)) {
            continue;
        }

        context.valuesToMask.push(namespace.name, namespace.resourceGroupName, connectionName);
        return { namespace, connection: { name: connectionName } };
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
