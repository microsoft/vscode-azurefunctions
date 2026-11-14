/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type MessageItem } from 'vscode';
import { getConnectorSampleOperationFunctions } from '../../connectorTrigger/connectorSampleProject';
import { getConnectorTriggerEventIdentity } from '../../connectorTrigger/connectorTriggerEventIdentity';
import { ConnectorTriggerProjectMetadataError } from '../../connectorTrigger/connectorTriggerProjectMetadata';
import { localSettingsFileName } from '../../constants';
import { getLocalSettingsJson, type ILocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import {
    ConnectorTriggerSetupEventSwitchError,
    type ConnectorTriggerF5Dependencies,
    type ConnectorTriggerHostLaunch,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerProjectMetadata,
} from './connectorTriggerF5Contracts';
import {
    ConnectorTriggerF5SetupError,
    isValidConnectorPollingEndpoint,
    runConnectorTriggerF5Setup,
} from './connectorTriggerF5Setup';
import { createConnectorTriggerF5Dependencies } from './createConnectorTriggerF5Dependencies';
import { usesConnectorVscodeCredential } from './connectorTriggerVscodeCredential';

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
        const dependencies: ConnectorTriggerF5Dependencies = options?.hostLaunch ?
            { ...baseDependencies, hostLaunch: options.hostLaunch } :
            baseDependencies;
        const bindings = await dependencies.bindingResolver.find(context, projectPath);
        context.telemetry.properties.connectorPollTriggerDetected = String(bindings.length > 0);
        if (bindings.length === 0) {
            return;
        }

        const environment = dependencies.hostLaunch?.environment ?? options?.environment ?? process.env;
        const settings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
        const evaluations = bindings.map(binding => evaluateConnectorTriggerSettings(context, settings, binding, environment));
        const settingsValid = evaluations.every(isConfigured);
        const useVscodeCredential = isVscodeCredentialLaunch(dependencies, bindings[0], settings, environment);
        const deferredEncrypted = evaluations.some(evaluation => getSettings(evaluation).some(setting => setting.state === 'encrypted'));
        context.telemetry.properties.connectorNamespaceSettingsValid = String(settingsValid);
        context.telemetry.properties.connectorNamespaceSettingsEncrypted = String(settings.IsEncrypted === true);
        if (settingsValid) {
            // Core Tools decrypts encrypted values when the host starts; their contents are not validated here.
            context.telemetry.properties.connectorNamespaceSettingsDeferred = String(deferredEncrypted);
            context.telemetry.properties.connectorF5SetupResult = 'alreadyConfigured';
            return;
        }

        const configure: MessageItem = { title: localize('configureConnectorTrigger', 'Configure') };
        const debugAnyway: MessageItem = { title: localize('debugAnyway', 'Debug Anyway') };
        if (bindings.length > 1) {
            await configureMultipleEvents(context, projectPath, dependencies, bindings, evaluations, settings, environment);
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
                "This project's Connector Trigger needs to be configured before it can run. Configure it using your Azure Resources sign-in? The local-only VisualStudioCodeCredential selection applies to every default Azure credential chain in the Functions host process, not only this connector. Existing explicit credentials are not replaced.",
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
        await runConnectorTriggerF5Setup(context, projectPath, metadata, binding,
            useVscodeCredential ? { ...dependencies, useVscodeCredential: true } : dependencies);
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
            'connectorMultipleEventsRequireConfiguration',
            "This project has {0} Connector Trigger events, and {1} need to be configured before they can run: {2}. Configure them now? You can choose which event to configure at the top of the setup screen.",
            bindings.length,
            pending.length,
            pendingLabels(pending),
        ) + (useVscodeCredential.every(Boolean) ? ' ' + localize(
            'connectorMultipleEventsVscodeCredential',
            'Setup uses your Azure Resources sign-in. The local-only VisualStudioCodeCredential selection applies to every default Azure credential chain in the Functions host process, not only these connectors. Existing explicit credentials are not replaced.',
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

    const resolveMetadata = await createEventMetadataResolver(projectPath, dependencies);
    let selected = pending[0];
    let configuredCount = 0;
    while (pending.length > 0) {
        const index = pending.includes(selected) ? selected : pending[0];
        const binding = bindings[index];
        const metadata = resolveMetadata(binding);
        context.telemetry.properties.connectorF5HandoffDetected = String(!!metadata);
        try {
            await runConnectorTriggerF5Setup(context, projectPath, metadata, binding, {
                ...dependencies,
                ...(isVscodeCredentialLaunch(dependencies, binding, settings, environment) ? { useVscodeCredential: true } : {}),
                setupEvents: {
                    choices: bindings.map((candidate, candidateIndex) => ({
                        id: String(candidateIndex),
                        label: getBindingLabel(candidate),
                        configured: !pending.includes(candidateIndex),
                    })),
                    selectedId: String(index),
                },
            });
            pending.splice(pending.indexOf(index), 1);
            configuredCount += 1;
            context.telemetry.measurements.connectorEventsConfiguredCount = configuredCount;
            selected = pending.find(candidate => candidate > index) ?? pending[0];
        } catch (error) {
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
    projectPath: string,
    dependencies: ConnectorTriggerF5Dependencies,
): Promise<(binding: ConnectorTriggerLocalBinding) => ConnectorTriggerProjectMetadata | undefined> {
    const events = await dependencies.projectStore.readEvents?.(projectPath) ?? [];
    if (events.length === 0) {
        return () => undefined;
    }
    const sampleFunctions = await getConnectorSampleOperationFunctions(projectPath);
    const eventFunctions = events.map(event => ({
        event,
        functionName: (sampleFunctions.get(event.operationId.toLowerCase()) ??
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
