/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type MessageItem } from 'vscode';
import { getConnectorSampleOperationFunctions } from '../../connectorTrigger/connectorSampleProject';
import { filterEnabledConnectorBindings } from '../../connectorTrigger/connectorTriggerBindings';
import { getConnectorTriggerEventIdentity } from '../../connectorTrigger/connectorTriggerEventIdentity';
import { ConnectorTriggerProjectMetadataError } from '../../connectorTrigger/connectorTriggerProjectMetadata';
import { localSettingsFileName } from '../../constants';
import { ext } from '../../extensionVariables';
import { getLocalSettingsJson, type ILocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { validateAzdInstalled } from '../../azd/validateAzdInstalled';
import { getConnectorTriggerSettingValue } from './ConnectorTriggerLocalSettingsWriter';
import {
    ConnectorAzdAuthTokenError,
    authorizeConnectorAzdAuth,
    disposeConnectorAzdAuthServer,
    ensureConnectorAzdAuthServer,
    getConnectorAzdAuthAccount,
    removeConnectorAzdAuthEnvironment,
    updateConnectorAzdAuthIdentity,
    type ConnectorAzdAuthAccount,
} from './connectorTriggerAzdAuthServer';
import {
    ConnectorTriggerSetupEventSwitchError,
    type ConnectorTriggerAzdAuthPreparer,
    type ConnectorTriggerF5Dependencies,
    type ConnectorTriggerHostLaunch,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerProjectMetadata,
    type ConnectorTriggerReusableConnection,
    type ConnectorTriggerSharedConnection,
} from './connectorTriggerF5Contracts';
import {
    ConnectorTriggerF5SetupError,
    isValidConnectorPollingEndpoint,
    runConnectorTriggerF5Setup,
} from './connectorTriggerF5Setup';
import { createConnectorTriggerF5Dependencies } from './createConnectorTriggerF5Dependencies';
import { readEncryptedConnectorTenants } from './connectorTriggerEncryptedTenants';
import { tokenCredentialsSetting, usesConnectorVscodeCredential } from './connectorTriggerVscodeCredential';

export interface ConnectorTriggerPreDebugOptions {
    /**
     * Complete effective environment of the Functions host process that F5 will start, such as the
     * selected host task's `options.env` applied over `process.env`. Used when no host launch is supplied;
     * defaults to `process.env`. Values can be secrets: never log them or include them in telemetry or errors.
     */
    environment?: Readonly<Record<string, string | undefined>>;
    /**
     * How F5 will start the Functions host, forwarded unchanged to setup so it can validate and
     * evaluate the host credential. Its merged environment takes precedence over `environment` when
     * validating settings. Overrides any hostLaunch on injected dependencies.
     */
    hostLaunch?: ConnectorTriggerHostLaunch;
}

type ConnectorTriggerSettingState = 'valid' | 'missing' | 'invalid' | 'encrypted';

interface ConnectorTriggerSettingEvaluation {
    state: ConnectorTriggerSettingState;
    environmentOverride: boolean;
}

interface ConnectorTriggerSettingsEvaluation {
    pollingEndpoint: ConnectorTriggerSettingEvaluation;
    triggerConfig: ConnectorTriggerSettingEvaluation;
}

export async function validateConnectorNamespacePreDebug(
    context: IActionContext,
    projectPath: string,
    injectedDependencies?: ConnectorTriggerF5Dependencies,
    options?: ConnectorTriggerPreDebugOptions,
): Promise<void> {
    try {
        const baseDependencies = injectedDependencies ?? await createConnectorTriggerF5Dependencies(context, projectPath);
        const hostLaunch = options?.hostLaunch ?? baseDependencies.hostLaunch;
        // A task read back from the task provider can already carry the azd authentication values F5 injected.
        const dependencies: ConnectorTriggerF5Dependencies = hostLaunch ?
            { ...baseDependencies, hostLaunch: removeInjectedHostLaunchEnvironment(projectPath, hostLaunch) } :
            baseDependencies;
        const foundBindings = await dependencies.bindingResolver.find(context, projectPath);
        context.telemetry.properties.connectorPollTriggerDetected = String(foundBindings.length > 0);
        if (foundBindings.length === 0) {
            (dependencies.azdAuth ?? defaultAzdAuthPreparer).dispose(projectPath);
            return;
        }

        const environment = dependencies.hostLaunch?.environment ??
            removeConnectorAzdAuthEnvironment(projectPath, options?.environment ?? process.env);
        const settings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
        // The host does not load disabled functions, so their triggers need no configuration to debug.
        const bindings = filterEnabledConnectorBindings(foundBindings, name => getEffectiveSettingValue(settings, environment, name));
        context.telemetry.measurements.connectorDisabledPollTriggerCount = foundBindings.length - bindings.length;
        if (bindings.length === 0) {
            (dependencies.azdAuth ?? defaultAzdAuthPreparer).dispose(projectPath);
            return;
        }
        const evaluations = bindings.map(binding => evaluateConnectorTriggerSettings(context, settings, binding, environment));
        const settingsValid = evaluations.every(isConfigured);
        const useVscodeCredential = isVscodeCredentialLaunch(dependencies, bindings[0], settings, environment);
        const azdBindings = bindings.filter(binding => isVscodeCredentialLaunch(dependencies, binding, settings, environment));
        context.telemetry.properties.connectorAzdAuth = String(azdBindings.length > 0);
        const tenantSettings = azdBindings.length > 0 && settingsValid ?
            await resolveTenantSettings(context, dependencies, projectPath, azdBindings, settings, environment) :
            settings;
        if (azdBindings.length > 0) {
            const azdAuth = dependencies.azdAuth ?? defaultAzdAuthPreparer;
            const prepared = await azdAuth.prepare(context, projectPath, {
                tenantIds: getTenantIds(azdBindings, tenantSettings, environment),
                pinCredential: getEffectiveValue(settings, environment, tokenCredentialsSetting) === undefined,
            });
            if (!prepared) {
                context.telemetry.properties.connectorF5SetupBlocked = 'azdUnavailable';
                throw new UserCancelledError('azdUnavailable');
            }
        } else {
            (dependencies.azdAuth ?? defaultAzdAuthPreparer).dispose(projectPath);
        }
        const deferredEncrypted = evaluations.some(evaluation => getSettings(evaluation).some(setting => setting.state === 'encrypted'));
        context.telemetry.properties.connectorNamespaceSettingsValid = String(settingsValid);
        context.telemetry.properties.connectorNamespaceSettingsEncrypted = String(settings.IsEncrypted === true);
        if (settingsValid) {
            if (azdBindings.length > 0) {
                await authorizePollingScopes(context, dependencies, projectPath, azdBindings, tenantSettings, environment);
            }
            // Core Tools decrypts encrypted values when the host starts; their contents are not validated here.
            context.telemetry.properties.connectorNamespaceSettingsDeferred = String(deferredEncrypted);
            context.telemetry.properties.connectorF5SetupResult = 'alreadyConfigured';
            return;
        }

        const configure: MessageItem = { title: localize('configureConnectorTrigger', 'Configure') };
        const debugAnyway: MessageItem = { title: localize('debugAnyway', 'Debug Anyway') };
        if (bindings.length > 1) {
            await configureMultipleEvents(context, projectPath, dependencies, bindings, evaluations, settings, environment);
            if (azdBindings.length > 0 && context.telemetry.properties.connectorF5SetupResult === 'completed') {
                const updatedSettings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
                await authorizePollingScopes(context, dependencies, projectPath, azdBindings, updatedSettings, environment);
            }
            return;
        }
        // Setup writes both settings, so any override of either one or an encrypted file would only fail
        // after Azure resources are provisioned. Explain the blocker instead of offering Configure.
        const blocker = getSetupBlocker(evaluations[0], settings.IsEncrypted === true);
        if (blocker) {
            context.telemetry.properties.connectorF5SetupBlocked = blocker;
        }
        const result = await context.ui.showWarningMessage(
            blocker ? getBlockerMessage(blocker) : useVscodeCredential ? localize(
                'connectorTriggerVscodeConfigurationRequiredForDebug',
                "This project's Connector Trigger needs to be configured before it can run. Configure it using your Azure Resources sign-in? The Functions host task receives your sign-in through the Azure Developer CLI (azd) for every default Azure credential chain in the host process, not only this connector. Nothing is written to local.settings.json, and existing explicit credentials are not replaced.",
            ) : localize(
                'connectorTriggerConfigurationRequiredForDebug',
                "This project's Connector Trigger needs to be configured before it can run. Configure it now?",
            ),
            { modal: true, stepName: 'missingConnectorTriggerSettings' },
            ...(!blocker ? [configure, debugAnyway] : [debugAnyway]),
        );
        if (result === debugAnyway) {
            context.telemetry.properties.connectorF5SetupResult = 'debugAnyway';
            return;
        }
        if (blocker || result !== configure) {
            throw new UserCancelledError('missingConnectorTriggerSettings');
        }

        // A task descriptor does not prove which identity the Functions host will use, so setup must
        // not provision, grant access or write settings for it until that identity can be verified.
        if (dependencies.hostLaunch?.kind === 'task' && !useVscodeCredential) {
            throwUnverifiedTaskLaunch(context);
        }
        const binding = bindings[0];
        const metadata = await dependencies.projectStore.read(projectPath);
        context.telemetry.properties.connectorF5HandoffDetected = String(!!metadata);
        const configured = await runConnectorTriggerF5Setup(context, projectPath, metadata, binding,
            useVscodeCredential ? withVscodeAccountValidation(dependencies, projectPath, azdBindings, binding, environment) : dependencies);
        if (useVscodeCredential) {
            await (dependencies.azdAuth ?? defaultAzdAuthPreparer).updateIdentity(projectPath, getAzdAuthIdentity(configured.sharedConnection));
            const updatedSettings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
            await authorizePollingScopes(context, dependencies, projectPath, azdBindings, updatedSettings, environment);
        }
    } catch (error) {
        if (isUserCancelledError(error) || error instanceof ConnectorTriggerF5SetupError) {
            throw error;
        }

        if (error instanceof ConnectorTriggerProjectMetadataError) {
            throw new ConnectorTriggerF5SetupError(error, localize(
                'connectorSetupInvalidProjectIdentity',
                'Correct or remove this project\'s Connector event selection in .vscode/settings.json, then retry F5 to select the connector and event explicitly.',
            ));
        }
        if (error instanceof ConnectorAzdAuthTokenError) {
            throw new ConnectorTriggerF5SetupError(error, error.message);
        }
        throw new ConnectorTriggerF5SetupError(error);
    }
}

type ConnectorTriggerSetupBlocker = 'environmentOverride' | 'encrypted';

/**
 * Configures each incomplete polling event in turn. The setup screen lists every event so the user can
 * choose which one to configure, and stopping before every event is configured shows a warning.
 */
async function configureMultipleEvents(
    context: IActionContext,
    projectPath: string,
    dependencies: ConnectorTriggerF5Dependencies,
    bindings: ConnectorTriggerLocalBinding[],
    evaluations: ConnectorTriggerSettingsEvaluation[],
    settings: ILocalSettingsJson,
    environment: Readonly<Record<string, string | undefined>>,
): Promise<void> {
    const configure: MessageItem = { title: localize('configureConnectorTrigger', 'Configure') };
    const debugAnyway: MessageItem = { title: localize('debugAnyway', 'Debug Anyway') };
    const continueConfiguring: MessageItem = { title: localize('continueConfiguringConnectorTriggers', 'Continue Configuring') };
    const pending = bindings.map((_, index) => index).filter(index => !isConfigured(evaluations[index]));
    context.telemetry.measurements.connectorEventCount = bindings.length;
    context.telemetry.measurements.connectorEventsPendingCount = pending.length;

    const blockers = pending.map(index => getSetupBlocker(evaluations[index], settings.IsEncrypted === true));
    const blocker: ConnectorTriggerSetupBlocker | undefined = blockers.includes('environmentOverride') ?
        'environmentOverride' :
        blockers.find(value => value !== undefined);
    if (blocker) {
        context.telemetry.properties.connectorF5SetupBlocked = blocker;
    }
    const useVscodeCredential = pending.map(index => isVscodeCredentialLaunch(dependencies, bindings[index], settings, environment));
    const pendingLabels = (indices: number[]): string => indices.map(index => getBindingLabel(bindings[index])).join(', ');
    const result = await context.ui.showWarningMessage(
        blocker ? getBlockerMessage(blocker) : localize(
            'connectorMultipleEventsNeedConfiguration',
            'Some Connector Triggers need to be configured before testing this app. Proceed? Resources will be created.',
        ) + (useVscodeCredential.every(Boolean) ? ' ' + localize(
            'connectorMultipleEventsVscodeCredential',
            'Setup uses your Azure Resources sign-in. The Functions host task receives it through the Azure Developer CLI (azd) for every default Azure credential chain in the host process, not only these connectors. Nothing is written to local.settings.json, and existing explicit credentials are not replaced.',
        ) : ''),
        { modal: true, stepName: 'missingConnectorTriggerSettings' },
        ...(!blocker ? [configure, debugAnyway] : [debugAnyway]),
    );
    if (result === debugAnyway) {
        context.telemetry.properties.connectorF5SetupResult = 'debugAnyway';
        return;
    }
    if (blocker || result !== configure) {
        throw new UserCancelledError('missingConnectorTriggerSettings');
    }
    if (dependencies.hostLaunch?.kind === 'task' && !useVscodeCredential.every(Boolean)) {
        throwUnverifiedTaskLaunch(context);
    }

    const resolveMetadata = await createEventMetadataResolver(context, projectPath, dependencies);
    const sharedConnections = new Map<string, ConnectorTriggerSharedConnection>();
    const reusableConnections: ConnectorTriggerReusableConnection[] = [];
    let selected = pending[0];
    let configuredCount = 0;
    let completedEventLabel: string | undefined;
    while (pending.length > 0) {
        const index = pending.includes(selected) ? selected : pending[0];
        const binding = bindings[index];
        const metadata = resolveMetadata(binding);
        context.telemetry.properties.connectorF5HandoffDetected = String(!!metadata);
        try {
            const connectionKey = binding.connectionSettingName.toLowerCase();
            const sharedConnection = sharedConnections.get(connectionKey);
            const configuredSibling = bindings.findIndex((candidate, candidateIndex) =>
                candidateIndex !== index &&
                candidate.connectionSettingName.toLowerCase() === connectionKey &&
                evaluations[candidateIndex].pollingEndpoint.state === 'valid' &&
                evaluations[candidateIndex].triggerConfig.state === 'valid');
            const sibling = configuredSibling < 0 ? undefined : bindings[configuredSibling];
            const values = settings.Values ?? {};
            const effectiveValue = (name: string): string | undefined =>
                getEnvironmentValue(environment, name) ?? getConnectorTriggerSettingValue(values, name);
            const pollingEndpoint = sibling && effectiveValue(`${sibling.connectionSettingName}__pollingEndpoint`);
            const triggerConfigName = sibling && effectiveValue(sibling.triggerConfigSettingName);
            if (sibling && (!pollingEndpoint || !triggerConfigName)) {
                throw new ConnectorTriggerF5SetupError(undefined, localize(
                    'connectorSharedSettingsUnavailable',
                    'The existing shared Connector Trigger settings could not be read. Retry F5 before configuring another event.',
                ));
            }
            const useVscodeCredentialForEvent = isVscodeCredentialLaunch(dependencies, binding, settings, environment);
            const setupDependencies = useVscodeCredentialForEvent ?
                withVscodeAccountValidation(dependencies, projectPath, bindings.filter(candidate =>
                    isVscodeCredentialLaunch(dependencies, candidate, settings, environment)), binding, environment) :
                dependencies;
            const configured = await runConnectorTriggerF5Setup(context, projectPath, metadata, binding, {
                ...setupDependencies,
                ...(isVscodeCredentialLaunch(dependencies, binding, settings, environment) ? { useVscodeCredential: true } : {}),
                ...(sharedConnection ? { sharedConnection } : {}),
                ...(reusableConnections.length > 0 ? { reusableConnections: [...reusableConnections] } : {}),
                ...(sibling && pollingEndpoint && triggerConfigName ? {
                    configuredSharedEvent: {
                        pollingEndpoint,
                        triggerConfigName,
                        triggerConfigSettingName: sibling.triggerConfigSettingName,
                        triggerConfigFromEnvironment: evaluations[configuredSibling].triggerConfig.environmentOverride,
                    },
                } : {}),
                protectSharedPollingEndpoint: bindings.some((candidate, candidateIndex) =>
                    candidateIndex !== index && candidate.connectionSettingName.toLowerCase() === connectionKey),
                setupEvents: {
                    choices: bindings.map((candidate, candidateIndex) => ({
                        id: String(candidateIndex),
                        label: getBindingLabel(candidate),
                        configured: !pending.includes(candidateIndex),
                    })),
                    selectedId: String(index),
                    ...(completedEventLabel ? { completedEventLabel } : {}),
                },
            });
            sharedConnections.set(connectionKey, configured.sharedConnection);
            reusableConnections.push(configured.connection);
            if (useVscodeCredentialForEvent) {
                await (dependencies.azdAuth ?? defaultAzdAuthPreparer).updateIdentity(projectPath, getAzdAuthIdentity(configured.sharedConnection));
            }
            pending.splice(pending.indexOf(index), 1);
            configuredCount += 1;
            completedEventLabel = getBindingLabel(binding);
            context.telemetry.measurements.connectorEventsConfiguredCount = configuredCount;
            selected = pending.find(candidate => candidate > index) ?? pending[0];
        } catch (error) {
            completedEventLabel = undefined;
            if (error instanceof ConnectorTriggerSetupEventSwitchError) {
                selected = Number(error.eventId);
                continue;
            }
            if (!isUserCancelledError(error)) {
                throw error;
            }
            const choice = await context.ui.showWarningMessage(
                localize(
                    'connectorEventsStillIncomplete',
                    '{0} of {1} Connector Trigger events are not configured: {2}. These events will not run until their polling endpoint and Trigger Config settings are configured. Continue configuring, or debug without them?',
                    pending.length,
                    bindings.length,
                    pendingLabels(pending),
                ),
                { modal: true, stepName: 'connectorEventsStillIncomplete' },
                continueConfiguring,
                debugAnyway,
            );
            if (choice === debugAnyway) {
                context.telemetry.properties.connectorF5SetupResult = configuredCount > 0 ? 'partiallyConfigured' : 'debugAnyway';
                return;
            }
            if (choice !== continueConfiguring) {
                throw error;
            }
        }
    }
    context.telemetry.properties.connectorF5SetupResult = 'completed';
}

/** Associates a binding with its authored event by function name, as project creation named each function. */
async function createEventMetadataResolver(
    context: IActionContext,
    projectPath: string,
    dependencies: ConnectorTriggerF5Dependencies,
): Promise<(binding: ConnectorTriggerLocalBinding) => ConnectorTriggerProjectMetadata | undefined> {
    const events = await dependencies.projectStore.readEvents?.(projectPath) ?? [];
    if (events.length === 0) {
        return () => undefined;
    }
    const sampleFunctions = await getConnectorSampleOperationFunctions(projectPath, () => {
        if (context.telemetry.properties.connectorF5InvalidInfraJson !== 'true') {
            context.telemetry.properties.connectorF5InvalidInfraJson = 'true';
            ext.outputChannel.appendLog(localize(
                'connectorF5InvalidInfrastructureMetadata',
                'Skipped optional Connector Trigger infrastructure metadata because it contains invalid JSON. You may need to select the connector and event manually.',
            ));
        }
    });
    const eventFunctions = events.map(event => ({
        event,
        functionName: (event.functionName ?? sampleFunctions.get(event.operationId.toLowerCase()) ??
            getConnectorTriggerEventIdentity(event.connectorId, event.operationId).functionName).toLowerCase(),
    }));
    return binding => {
        const functionName = binding.functionName?.toLowerCase();
        const matches = functionName ? eventFunctions.filter(candidate => candidate.functionName === functionName) : [];
        return matches.length === 1 ? matches[0].event : undefined;
    };
}

function getBindingLabel(binding: ConnectorTriggerLocalBinding): string {
    return binding.functionName?.trim() || binding.triggerConfigSettingName;
}

function isVscodeCredentialLaunch(
    dependencies: ConnectorTriggerF5Dependencies,
    binding: ConnectorTriggerLocalBinding,
    settings: ILocalSettingsJson,
    environment: Readonly<Record<string, string | undefined>>,
): boolean {
    return dependencies.hostLaunch?.kind === 'task' &&
        dependencies.hostLaunch.standardFunctionsTask === true &&
        dependencies.hostLaunch.execution !== 'custom' &&
        usesConnectorVscodeCredential(binding.connectionSettingName, settings, environment);
}

const defaultAzdAuthPreparer: ConnectorTriggerAzdAuthPreparer = {
    async prepare(context, projectPath, options): Promise<boolean> {
        const azd = await validateAzdInstalled(context, localize(
            'connectorAzdRequired',
            'The Azure Developer CLI is required to debug this function app. Would you like to install now?',
        ));
        if (!azd) {
            return false;
        }
        await ensureConnectorAzdAuthServer(projectPath, options.tenantIds, {
            pinCredential: options.pinCredential,
            ...(azd.pathDirectory ? { pathDirectory: azd.pathDirectory } : {}),
        });
        return true;
    },
    getAccount: getConnectorAzdAuthAccount,
    updateIdentity: updateConnectorAzdAuthIdentity,
    authorize: async (context, projectPath, tenants) => await authorizeConnectorAzdAuth(context, projectPath, tenants),
    dispose: disposeConnectorAzdAuthServer,
};

/**
 * Enables the VS Code credential for setup and, before setup changes Azure resources, rejects an account that differs
 * from the one another event's connection already uses in the same tenant. The host's token requests name only a
 * tenant, so it cannot use different accounts for events in one tenant.
 */
function withVscodeAccountValidation(
    dependencies: ConnectorTriggerF5Dependencies,
    projectPath: string,
    azdBindings: ConnectorTriggerLocalBinding[],
    binding: ConnectorTriggerLocalBinding,
    environment: Readonly<Record<string, string | undefined>>,
): ConnectorTriggerF5Dependencies {
    return {
        ...dependencies,
        useVscodeCredential: true,
        validateVscodeAccount: async (context, subscription) => {
            const existing = (dependencies.azdAuth ?? defaultAzdAuthPreparer).getAccount(projectPath, subscription.tenantId);
            const connectionName = binding.connectionSettingName.toLowerCase();
            const others = azdBindings.filter(candidate => candidate.connectionSettingName.toLowerCase() !== connectionName);
            if (!existing || others.length === 0 ||
                (existing.accountId === undefined || existing.accountId === subscription.accountId) &&
                (existing.environmentName === undefined || existing.environmentName.toLowerCase() === subscription.environment.name.toLowerCase())) {
                return;
            }
            const settings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
            const tenantSettings = await resolveTenantSettings(context, dependencies, projectPath, others, settings, environment);
            if (getTenantIds(others, tenantSettings, environment).includes(subscription.tenantId.toLowerCase())) {
                context.telemetry.properties.connectorF5SetupBlocked = 'azdAccountConflict';
                throw new ConnectorTriggerF5SetupError(undefined, localize(
                    'connectorAzdAccountConflict',
                    'Another Connector Trigger event in this project uses a different Azure Resources account in the same tenant. The local Functions host can use only one account per tenant. Select a subscription under the same account, or use a different tenant, then retry F5. No Azure resources were changed.',
                ));
            }
        },
    };
}

function getAzdAuthIdentity(connection: ConnectorTriggerSharedConnection): ConnectorAzdAuthAccount & { tenantId: string } {
    const subscription = connection.scope.subscription;
    return {
        tenantId: subscription.tenantId,
        ...(subscription.accountId ? { accountId: subscription.accountId } : {}),
        environmentName: subscription.environment.name,
    };
}

function getEffectiveValue(
    settings: ILocalSettingsJson,
    environment: Readonly<Record<string, string | undefined>>,
    name: string,
): string | undefined {
    return getEnvironmentValue(environment, name) ?? getConnectorTriggerSettingValue(settings.Values ?? {}, name);
}

function getTenantIds(
    bindings: ConnectorTriggerLocalBinding[],
    settings: ILocalSettingsJson,
    environment: Readonly<Record<string, string | undefined>>,
): (string | undefined)[] {
    return [...new Set(bindings.map(binding => {
        const name = `${binding.connectionSettingName}__tenantId`;
        const value = getEnvironmentValue(environment, name) ??
            (settings.IsEncrypted === true ? undefined : getConnectorTriggerSettingValue(settings.Values ?? {}, name)) ??
            getEnvironmentValue(environment, 'AZURE_TENANT_ID') ??
            (settings.IsEncrypted === true ? undefined : getConnectorTriggerSettingValue(settings.Values ?? {}, 'AZURE_TENANT_ID'));
        return value?.trim().toLowerCase() || undefined;
    }))];
}

async function authorizePollingScopes(
    context: IActionContext,
    dependencies: ConnectorTriggerF5Dependencies,
    projectPath: string,
    bindings: ConnectorTriggerLocalBinding[],
    settings: ILocalSettingsJson,
    environment: Readonly<Record<string, string | undefined>>,
): Promise<void> {
    const tenantSettings = await resolveTenantSettings(context, dependencies, projectPath, bindings, settings, environment);
    const tenants = getTenantIds(bindings, tenantSettings, environment);
    if (tenants.length > 0) {
        try {
            await (dependencies.azdAuth ?? defaultAzdAuthPreparer).authorize(context, projectPath, tenants);
        } catch (error) {
            if (isUserCancelledError(error) || error instanceof ConnectorAzdAuthTokenError) {
                throw error;
            }
            throw new ConnectorTriggerF5SetupError(undefined, localize(
                'connectorAzdAuthConsentFailed',
                'VS Code could not authorize the Connector Trigger polling scope. Sign in through Azure Resources, then retry debugging.',
            ));
        }
    }
}

async function resolveTenantSettings(
    context: IActionContext,
    dependencies: ConnectorTriggerF5Dependencies,
    projectPath: string,
    bindings: ConnectorTriggerLocalBinding[],
    settings: ILocalSettingsJson,
    environment: Readonly<Record<string, string | undefined>>,
): Promise<ILocalSettingsJson> {
    if (settings.IsEncrypted !== true) {
        return settings;
    }
    const connectionNames = bindings.map(binding => `${binding.connectionSettingName}__tenantId`);
    const needsDefault = connectionNames.some(name => getEnvironmentValue(environment, name) === undefined);
    const names = [...new Set([...connectionNames, ...(needsDefault ? ['AZURE_TENANT_ID'] : [])])];
    const encrypted = names.flatMap(name => {
        const value = getEnvironmentValue(environment, name) === undefined ?
            getConnectorTriggerSettingValue(settings.Values ?? {}, name) : undefined;
        return value === undefined ? [] : [{ name, value }];
    });
    const values = encrypted.length === 0 ? [] : await (dependencies.readEncryptedTenants ?? readEncryptedConnectorTenants)(
        context, projectPath, encrypted.map(entry => entry.value), environment,
    );
    for (const value of values) {
        maskValue(context, value);
    }
    return { IsEncrypted: false, Values: Object.fromEntries(encrypted.map((entry, index) => [entry.name, values[index]])) };
}

function removeInjectedHostLaunchEnvironment(projectPath: string, hostLaunch: ConnectorTriggerHostLaunch): ConnectorTriggerHostLaunch {
    const environment = removeConnectorAzdAuthEnvironment(projectPath, hostLaunch.environment);
    return hostLaunch.kind === 'task' && hostLaunch.environmentLayers ? {
        ...hostLaunch,
        environment,
        environmentLayers: hostLaunch.environmentLayers.map(layer => removeConnectorAzdAuthEnvironment(projectPath, layer)),
    } : { ...hostLaunch, environment };
}

function getBlockerMessage(blocker: ConnectorTriggerSetupBlocker): string {
    return blocker === 'environmentOverride' ? localize(
        'connectorEnvironmentOverrideBlocksSetup',
        "An environment variable overrides this project's Connector Trigger polling endpoint or Trigger Config setting, so automatic setup cannot update the settings the Functions host will use. Set both settings to valid values in the environment, or remove the overrides and restart VS Code, then retry F5. Debug Anyway does not configure the Connector Trigger.",
    ) : localize(
        'connectorEncryptedSettingsBlockSetup',
        "This project's Connector Trigger settings are missing from the encrypted local.settings.json. Decrypt local.settings.json using the Azure Functions extension, then retry F5 to configure the Connector Trigger. Debug Anyway does not configure the Connector Trigger.",
    );
}

function throwUnverifiedTaskLaunch(context: IActionContext): never {
    context.telemetry.properties.connectorF5SetupBlocked = 'unverifiedTaskLaunch';
    throw new ConnectorTriggerF5SetupError(undefined, localize(
        'connectorTaskLaunchUnsupported',
        "Automatic Connector Trigger setup can't verify the identity the Functions host started by this debug task will use, so nothing was created or changed. Set this project's Connector Trigger polling endpoint and Trigger Config settings in local.settings.json, then retry F5.",
    ));
}

export function isValidTriggerConfigReference(value: string | undefined): boolean {
    return !!value?.trim() && !value.includes('<') && !value.includes('>');
}

function evaluateConnectorTriggerSettings(
    context: IActionContext,
    settings: ILocalSettingsJson,
    binding: ConnectorTriggerLocalBinding,
    environment: Readonly<Record<string, string | undefined>>,
): ConnectorTriggerSettingsEvaluation {
    const values: unknown = settings.Values;
    const fileValues = values && typeof values === 'object' && !Array.isArray(values) ? values as Record<string, unknown> : {};
    const evaluate = (name: string, isValid: (value: string) => boolean): ConnectorTriggerSettingEvaluation => {
        maskValue(context, name);
        const environmentValue = getEnvironmentValue(environment, name);
        if (environmentValue !== undefined) {
            maskValue(context, environmentValue);
            return { state: isValid(environmentValue) ? 'valid' : 'invalid', environmentOverride: true };
        }
        const key = findSettingKey(fileValues, name);
        if (key === undefined) {
            return { state: 'missing', environmentOverride: false };
        }
        const value = fileValues[key];
        if (settings.IsEncrypted === true) {
            return { state: 'encrypted', environmentOverride: false };
        }
        if (typeof value !== 'string') {
            return { state: 'invalid', environmentOverride: false };
        }
        maskValue(context, value);
        return { state: isValid(value) ? 'valid' : 'invalid', environmentOverride: false };
    };
    return {
        pollingEndpoint: evaluate(`${binding.connectionSettingName}__pollingEndpoint`, isValidConnectorPollingEndpoint),
        triggerConfig: evaluate(binding.triggerConfigSettingName, isValidTriggerConfigReference),
    };
}

function getSettings(evaluation: ConnectorTriggerSettingsEvaluation): ConnectorTriggerSettingEvaluation[] {
    return [evaluation.pollingEndpoint, evaluation.triggerConfig];
}

function isConfigured(evaluation: ConnectorTriggerSettingsEvaluation): boolean {
    return getSettings(evaluation).every(setting => setting.state === 'valid' || setting.state === 'encrypted');
}

function getSetupBlocker(
    evaluation: ConnectorTriggerSettingsEvaluation,
    encrypted: boolean,
): ConnectorTriggerSetupBlocker | undefined {
    if (getSettings(evaluation).some(setting => setting.environmentOverride)) {
        return 'environmentOverride';
    }
    return encrypted ? 'encrypted' : undefined;
}

/** Matches the host: local.settings.json names are case-insensitive. */
function findSettingKey(values: Readonly<Record<string, unknown>>, name: string): string | undefined {
    return Object.hasOwn(values, name) ?
        name :
        Object.keys(values).find(candidate => candidate.toLowerCase() === name.toLowerCase());
}

// Encrypted file values can't be read before the host starts, so only plain-text values count.
function getEffectiveSettingValue(
    settings: ILocalSettingsJson,
    environment: Readonly<Record<string, string | undefined>>,
    name: string,
): unknown {
    // The host's environment configuration treats names as case-insensitive on every platform.
    const normalizedName = name.toLowerCase();
    let environmentValue: string | undefined;
    for (const [key, value] of Object.entries(environment)) {
        if (value !== undefined && key.toLowerCase() === normalizedName) {
            environmentValue = value;
        }
    }
    if (environmentValue !== undefined) {
        return environmentValue;
    }
    const values: unknown = settings.Values;
    if (settings.IsEncrypted === true || !values || typeof values !== 'object' || Array.isArray(values)) {
        return undefined;
    }
    const key = findSettingKey(values as Record<string, unknown>, name);
    return key === undefined ? undefined : (values as Record<string, unknown>)[key];
}

function getEnvironmentValue(environment: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
    const value = environment[name];
    if (value !== undefined || process.platform !== 'win32') {
        return value;
    }
    const key = Object.keys(environment).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : environment[key];
}

function maskValue(context: IActionContext, value: string): void {
    if (value && !context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}
