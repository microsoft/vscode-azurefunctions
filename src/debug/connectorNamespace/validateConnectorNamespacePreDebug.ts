/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type MessageItem } from 'vscode';
import { ConnectorTriggerProjectMetadataError } from '../../connectorTrigger/connectorTriggerProjectMetadata';
import { localSettingsFileName } from '../../constants';
import { getLocalSettingsJson, type ILocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { type ConnectorTriggerF5Dependencies, type ConnectorTriggerHostLaunch, type ConnectorTriggerLocalBinding } from './connectorTriggerF5Contracts';
import {
    ConnectorTriggerF5SetupError,
    isValidConnectorPollingEndpoint,
    runConnectorTriggerF5Setup,
} from './connectorTriggerF5Setup';
import { createConnectorTriggerF5Dependencies } from './createConnectorTriggerF5Dependencies';

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
        const singleEvent = bindings.length === 1;
        // Setup writes both settings, so any override of either one or an encrypted file would only fail
        // after Azure resources are provisioned. Explain the blocker instead of offering Configure.
        const blocker = singleEvent ? getSetupBlocker(evaluations[0], settings.IsEncrypted === true) : undefined;
        if (blocker) {
            context.telemetry.properties.connectorF5SetupBlocked = blocker;
        }
        const result = await context.ui.showWarningMessage(
            !singleEvent ? localize(
                'connectorMultipleEventsRequireConfiguration',
                'This project has multiple polling Connector Trigger events with incomplete settings. Automatic F5 setup supports one polling event per project. Configure each event using its binding-specific polling endpoint and Trigger Config setting in local.settings.json, then retry F5. Debug Anyway does not configure any events.',
            ) : blocker === 'environmentOverride' ? localize(
                'connectorEnvironmentOverrideBlocksSetup',
                "An environment variable overrides this project's Connector Trigger polling endpoint or Trigger Config setting, so automatic setup cannot update the settings the Functions host will use. Set both settings to valid values in the environment, or remove the overrides and restart VS Code, then retry F5. Debug Anyway does not configure the Connector Trigger.",
            ) : blocker === 'encrypted' ? localize(
                'connectorEncryptedSettingsBlockSetup',
                "This project's Connector Trigger settings are missing from the encrypted local.settings.json. Decrypt local.settings.json using the Azure Functions extension, then retry F5 to configure the Connector Trigger. Debug Anyway does not configure the Connector Trigger.",
            ) : localize(
                'connectorTriggerConfigurationRequiredForDebug',
                "This project's Connector Trigger needs to be configured before it can run. Configure it now?",
            ),
            { modal: true, stepName: 'missingConnectorTriggerSettings' },
            ...(singleEvent && !blocker ? [configure, debugAnyway] : [debugAnyway]),
        );
        if (result === debugAnyway) {
            context.telemetry.properties.connectorF5SetupResult = 'debugAnyway';
            return;
        }
        if (!singleEvent || blocker || result !== configure) {
            throw new UserCancelledError('missingConnectorTriggerSettings');
        }

        // A task descriptor does not prove which identity the Functions host will use, so setup must
        // not provision, grant access or write settings for it until that identity can be verified.
        if (dependencies.hostLaunch?.kind === 'task') {
            context.telemetry.properties.connectorF5SetupBlocked = 'unverifiedTaskLaunch';
            throw new ConnectorTriggerF5SetupError(undefined, localize(
                'connectorTaskLaunchUnsupported',
                "Automatic Connector Trigger setup can't verify the identity the Functions host started by this debug task will use, so nothing was created or changed. Set this project's Connector Trigger polling endpoint and Trigger Config settings in local.settings.json, then retry F5.",
            ));
        }

        const binding = bindings[0];
        const metadata = await dependencies.projectStore.read(projectPath);
        context.telemetry.properties.connectorF5HandoffDetected = String(!!metadata);
        await runConnectorTriggerF5Setup(context, projectPath, metadata, binding, dependencies);
    } catch (error) {
        if (isUserCancelledError(error) || error instanceof ConnectorTriggerF5SetupError) {
            throw error;
        }
        if (error instanceof ConnectorTriggerProjectMetadataError) {
            throw new ConnectorTriggerF5SetupError(error, localize(
                'connectorSetupInvalidProjectIdentity',
                'Correct or remove this project\'s azureFunctions.connectorTriggerProjects v1 entry, then retry F5 to select the connector and event explicitly.',
            ));
        }
        throw new ConnectorTriggerF5SetupError(error);
    }
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
): 'environmentOverride' | 'encrypted' | undefined {
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
