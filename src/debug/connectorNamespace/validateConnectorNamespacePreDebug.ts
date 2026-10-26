/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createSubscriptionContext, AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext, subscriptionExperience } from '@microsoft/vscode-azext-utils';
import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { addConnectorNamespaceCreateSteps } from '../../commands/createFunction/connectorSteps/addConnectorNamespaceCreateSteps';
import { type IConnectorNamespaceWizardContext } from '../../commands/createFunction/connectorSteps/IConnectorNamespaceWizardContext';
import { localSettingsFileName } from '../../constants';
import { ext } from '../../extensionVariables';
import { getLocalSettingsJson } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { createActivityContext } from '../../utils/activityUtils';
import { parseJson } from '../../utils/parseJson';

const pollingEndpointSuffix = '__pollingEndpoint';
const excludedFolders = '**/{.git,node_modules,.venv,venv,bin,obj,dist,out}/**';
const connectorSourceGlob = '**/*.{cs,py,js,ts}';

export async function validateConnectorNamespacePreDebug(context: IActionContext, projectPath: string): Promise<void> {
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

    const wizardContext: IConnectorNamespaceWizardContext = {
        ...context,
        ...createSubscriptionContext(await subscriptionExperience(context, ext.rgApiV2.resources.azureResourceTreeDataProvider)),
        ...await createActivityContext(),
    };
    const promptSteps: AzureWizardPromptStep<IConnectorNamespaceWizardContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IConnectorNamespaceWizardContext>[] = [];
    addConnectorNamespaceCreateSteps(wizardContext, promptSteps, executeSteps);

    const wizard = new AzureWizard(wizardContext, {
        title: localize('createConnectorNamespace', 'Create Connector Namespace'),
        promptSteps,
        executeSteps,
        showLoadingPrompt: true,
    });
    await wizard.prompt();
    await wizard.execute();
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
