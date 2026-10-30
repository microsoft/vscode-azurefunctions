/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, parseError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { createConnectorNamespace } from '../../commands/createFunction/connectorSteps/createConnectorNamespace';
import { localSettingsFileName } from '../../constants';
import { getLocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { parseJson } from '../../utils/parseJson';
import {
    type ConnectorTriggerF5Dependencies,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerProjectHandoff,
} from './connectorTriggerF5Contracts';
import {
    ConnectorTriggerF5SetupError,
    isValidConnectorPollingEndpoint,
    runConnectorTriggerF5Setup,
} from './connectorTriggerF5Setup';
import { createConnectorTriggerF5Dependencies } from './createConnectorTriggerF5Dependencies';

const pollingEndpointSuffix = '__pollingEndpoint';
const excludedFolders = '**/{.git,node_modules,.venv,venv,bin,obj,dist,out}/**';
const connectorSourceGlob = '**/*.{cs,py,js,ts}';

export async function validateConnectorNamespacePreDebug(
    context: IActionContext,
    projectPath: string,
    injectedDependencies?: ConnectorTriggerF5Dependencies,
): Promise<void> {
    const dependencies = injectedDependencies ?? await createConnectorTriggerF5Dependencies(context, projectPath);
    if (dependencies) {
        let handoff: ConnectorTriggerProjectHandoff | undefined;
        try {
            handoff = await dependencies.handoffStore.read(projectPath);
        } catch (error) {
            throw new ConnectorTriggerF5SetupError(error);
        }

        context.telemetry.properties.connectorF5HandoffDetected = String(!!handoff);
        if (handoff) {
            context.telemetry.properties.connectorPollTriggerDetected = 'true';
            try {
                const binding = await dependencies.bindingResolver.resolve(context, projectPath, handoff);
                const settingsValid = await areConnectorTriggerSettingsValid(context, projectPath, binding);
                context.telemetry.properties.connectorNamespaceSettingsValid = String(settingsValid);
                if (settingsValid) {
                    await dependencies.handoffStore.markComplete(projectPath);
                    context.telemetry.properties.connectorF5SetupResult = 'alreadyConfigured';
                    return;
                }

                await runConnectorTriggerF5Setup(context, projectPath, handoff, binding, dependencies);
                return;
            } catch (error) {
                if (parseError(error).isUserCancelledError) {
                    throw error;
                }
                throw error instanceof ConnectorTriggerF5SetupError ?
                    error :
                    new ConnectorTriggerF5SetupError(error);
            }
        }
    }

    const connectionPrefixes = await findPollingConnectorConnectionPrefixes(projectPath);
    context.telemetry.properties.connectorPollTriggerDetected = String(connectionPrefixes.size > 0);

    if (connectionPrefixes.size === 0) {
        return;
    }

    const settings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
    const areSettingsValid = [...connectionPrefixes].every(prefix => {
        const key = `${prefix}${pollingEndpointSuffix}`;
        return isValidPollingEndpoint(process.env[key] ?? settings.Values?.[key]);
    });
    context.telemetry.properties.connectorNamespaceSettingsValid = String(areSettingsValid);

    if (areSettingsValid) {
        return;
    }

    const createNamespace: vscode.MessageItem = { title: localize('createConnectorNamespace', 'Create Connector Namespace') };
    const debugAnyway: vscode.MessageItem = { title: localize('debugAnyway', 'Debug Anyway') };
    const message = localize(
        'connectorNamespaceRequiredForDebug',
        'This project has a polling connector trigger without a valid Connector Namespace polling endpoint. Create a Connector Namespace now? You will still need to configure its Trigger Config endpoint in "{0}".',
        localSettingsFileName,
    );
    const result = await context.ui.showWarningMessage(message, { modal: true, stepName: 'missingConnectorNamespaceSettings' }, createNamespace, debugAnyway);
    context.telemetry.properties.connectorNamespaceCreateSelected = String(result === createNamespace);

    if (result !== createNamespace) {
        return;
    }

    await createConnectorNamespace(context);
}

export async function areConnectorTriggerSettingsValid(
    context: IActionContext,
    projectPath: string,
    binding: ConnectorTriggerLocalBinding,
): Promise<boolean> {
    const pollingEndpointKey = `${binding.connectionSettingName}${pollingEndpointSuffix}`;
    const triggerConfigKey = binding.triggerConfigSettingName;
    maskValue(context, pollingEndpointKey);
    maskValue(context, triggerConfigKey);

    const settings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
    return isValidConnectorPollingEndpoint(process.env[pollingEndpointKey] ?? settings.Values?.[pollingEndpointKey]) &&
        isValidTriggerConfigReference(process.env[triggerConfigKey] ?? settings.Values?.[triggerConfigKey]);
}

export async function findPollingConnectorConnectionPrefixes(projectPath: string): Promise<Set<string>> {
    const prefixes = new Set<string>();
    const functionJsonFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(projectPath, '**/function.json'), excludedFolders);

    for (const file of functionJsonFiles) {
        const data = parseJson((await AzExtFsExtra.readFile(file.fsPath)).toString());
        for (const prefix of getPollingConnectorConnectionPrefixesFromFunctionJson(data)) {
            prefixes.add(prefix);
        }
    }

    const sourceFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(projectPath, connectorSourceGlob), excludedFolders);
    for (const file of sourceFiles) {
        const content = (await AzExtFsExtra.readFile(file.fsPath)).toString();
        for (const prefix of getPollingConnectorConnectionPrefixes(content)) {
            prefixes.add(prefix);
        }
    }

    return prefixes;
}

export function getPollingConnectorConnectionPrefixesFromFunctionJson(data: unknown): string[] {
    if (!isRecord(data) || !Array.isArray(data.bindings)) {
        return [];
    }

    return data.bindings
        .filter(binding =>
            isRecord(binding) &&
            equalsIgnoreCase(binding.type, 'connectorTrigger') &&
            equalsIgnoreCase(binding.deliveryMode, 'Poll') &&
            typeof binding.connection === 'string' &&
            !!binding.connection.trim())
        .map(binding => (binding as Record<string, string>).connection.trim());
}

export function getPollingConnectorConnectionPrefixes(content: string): string[] {
    return [
        ...getConnectionsFromBlocks(content, /\[\s*ConnectorTrigger\s*\(([\s\S]*?)\)\s*\]/gi, /DeliveryMode\s*=\s*(?:\w+\.)*Poll\b/i, /Connection\s*=\s*["']([^"']+)["']/i),
        ...getConnectionsFromBlocks(content, /@\w*\.?connector_trigger\s*\(([\s\S]*?)\)\s*(?:\r?\n)/gi, /delivery_mode\s*=\s*(?:\w+\.)*POLL\b/i, /connection\s*=\s*["']([^"']+)["']/i),
        ...getConnectionsFromBlocks(content, /\b(?:app\.)?connectorTrigger\s*\([^,]+,\s*\{([\s\S]*?)\bhandler\s*:/gi, /deliveryMode\s*:\s*["']Poll["']/i, /connection\s*:\s*["']([^"']+)["']/i),
    ];
}

export function isValidPollingEndpoint(value: string | undefined): boolean {
    if (!value || value.includes('<') || value.includes('>')) {
        return false;
    }

    try {
        const url = new URL(value);
        return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname;
    } catch {
        return false;
    }
}

export function isValidTriggerConfigReference(value: string | undefined): boolean {
    return !!value?.trim() && !value.includes('<') && !value.includes('>');
}

function getConnectionsFromBlocks(content: string, blockPattern: RegExp, pollPattern: RegExp, connectionPattern: RegExp): string[] {
    const connections: string[] = [];
    for (const match of content.matchAll(blockPattern)) {
        const block = match[1];
        const connectionMatch = pollPattern.test(block) ? connectionPattern.exec(block) : undefined;
        if (connectionMatch?.[1].trim()) {
            connections.push(connectionMatch[1].trim());
        }
    }
    return connections;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function equalsIgnoreCase(value: unknown, expected: string): boolean {
    return typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();
}

function maskValue(context: IActionContext, value: string): void {
    if (value && !context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}
