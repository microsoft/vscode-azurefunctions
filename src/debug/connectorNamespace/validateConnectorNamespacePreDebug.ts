/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type MessageItem } from 'vscode';
import { ConnectorTriggerProjectMetadataError } from '../../connectorTrigger/connectorTriggerProjectMetadata';
import { localSettingsFileName } from '../../constants';
import { getLocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { type ConnectorTriggerF5Dependencies, type ConnectorTriggerLocalBinding } from './connectorTriggerF5Contracts';
import {
    ConnectorTriggerF5SetupError,
    isValidConnectorPollingEndpoint,
    runConnectorTriggerF5Setup,
} from './connectorTriggerF5Setup';
import { createConnectorTriggerF5Dependencies } from './createConnectorTriggerF5Dependencies';

export async function validateConnectorNamespacePreDebug(
    context: IActionContext,
    projectPath: string,
    injectedDependencies?: ConnectorTriggerF5Dependencies,
): Promise<void> {
    try {
        const dependencies = injectedDependencies ?? await createConnectorTriggerF5Dependencies(context, projectPath);
        const bindings = await dependencies.bindingResolver.find(context, projectPath);
        context.telemetry.properties.connectorPollTriggerDetected = String(bindings.length > 0);
        if (bindings.length === 0) {
            return;
        }

        const settingsValid = (await Promise.all(bindings.map(async binding =>
            await areConnectorTriggerSettingsValid(context, projectPath, binding)))).every(Boolean);
        context.telemetry.properties.connectorNamespaceSettingsValid = String(settingsValid);
        if (settingsValid) {
            context.telemetry.properties.connectorF5SetupResult = 'alreadyConfigured';
            return;
        }

        const configure: MessageItem = { title: localize('configureConnectorTrigger', 'Configure') };
        const debugAnyway: MessageItem = { title: localize('debugAnyway', 'Debug Anyway') };
        const singleEvent = bindings.length === 1;
        const result = await context.ui.showWarningMessage(
            singleEvent ? localize(
                'connectorTriggerConfigurationRequiredForDebug',
                "This project's Connector Trigger needs to be configured before it can run. Configure it now?",
            ) : localize(
                'connectorMultipleEventsRequireConfiguration',
                'This project has multiple polling Connector Trigger events with incomplete settings. Automatic F5 setup supports one polling event per project. Configure each event using its binding-specific polling endpoint and Trigger Config setting in local.settings.json, then retry F5. Debug Anyway does not configure any events.',
            ),
            { modal: true, stepName: 'missingConnectorTriggerSettings' },
            ...(singleEvent ? [configure, debugAnyway] : [debugAnyway]),
        );
        if (result === debugAnyway) {
            context.telemetry.properties.connectorF5SetupResult = 'debugAnyway';
            return;
        }
        if (!singleEvent || result !== configure) {
            throw new UserCancelledError('missingConnectorTriggerSettings');
        }

        const binding = bindings[0];
        if (hasInvalidEnvironmentOverride(binding)) {
            throw new ConnectorTriggerF5SetupError(undefined, localize(
                'connectorInvalidEnvironmentOverride',
                'An invalid environment-variable override prevents Connector Trigger setup from updating its effective settings. Correct or remove the override, restart VS Code, and retry F5.',
            ));
        }
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

export async function areConnectorTriggerSettingsValid(
    context: IActionContext,
    projectPath: string,
    binding: ConnectorTriggerLocalBinding,
): Promise<boolean> {
    const pollingEndpointKey = `${binding.connectionSettingName}__pollingEndpoint`;
    const triggerConfigKey = binding.triggerConfigSettingName;
    for (const key of [pollingEndpointKey, triggerConfigKey]) {
        if (!context.valuesToMask.includes(key)) {
            context.valuesToMask.push(key);
        }
    }
    const settings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
    return isValidConnectorPollingEndpoint(process.env[pollingEndpointKey] ?? settings.Values?.[pollingEndpointKey]) &&
        isValidTriggerConfigReference(process.env[triggerConfigKey] ?? settings.Values?.[triggerConfigKey]);
}

export function isValidTriggerConfigReference(value: string | undefined): boolean {
    return !!value?.trim() && !value.includes('<') && !value.includes('>');
}

function hasInvalidEnvironmentOverride(binding: ConnectorTriggerLocalBinding): boolean {
    const endpoint = process.env[`${binding.connectionSettingName}__pollingEndpoint`];
    const config = process.env[binding.triggerConfigSettingName];
    return endpoint !== undefined && !isValidConnectorPollingEndpoint(endpoint) ||
        config !== undefined && !isValidTriggerConfigReference(config);
}
