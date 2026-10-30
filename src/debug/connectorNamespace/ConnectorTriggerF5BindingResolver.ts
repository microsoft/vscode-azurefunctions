/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { parseJson } from '../../utils/parseJson';
import {
    type ConnectorTriggerBindingResolver,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerProjectHandoff,
} from './connectorTriggerF5Contracts';

const excludedFolders = '**/{.git,node_modules,.venv,venv,bin,obj,dist,out}/**';
const connectorSourceGlob = '**/*.{cs,py,js,ts}';

interface BindingCandidate extends ConnectorTriggerLocalBinding {
    functionName?: string;
}

export class ProjectConnectorTriggerBindingResolver implements ConnectorTriggerBindingResolver {
    public async resolve(
        context: IActionContext,
        projectPath: string,
        handoff: ConnectorTriggerProjectHandoff,
    ): Promise<ConnectorTriggerLocalBinding> {
        const candidates: BindingCandidate[] = [];
        const functionJsonFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(projectPath, '**/function.json'),
            excludedFolders,
        );
        for (const file of functionJsonFiles) {
            const data = parseJson((await AzExtFsExtra.readFile(file.fsPath)).toString());
            candidates.push(...getPollingConnectorBindingsFromFunctionJson(
                data,
                path.basename(path.dirname(file.fsPath)),
            ));
        }

        const sourceFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(projectPath, connectorSourceGlob),
            excludedFolders,
        );
        for (const file of sourceFiles) {
            candidates.push(...getPollingConnectorBindings(
                (await AzExtFsExtra.readFile(file.fsPath)).toString(),
            ));
        }

        const binding = selectPollingConnectorBinding(candidates, handoff.operationId);
        maskValue(context, binding.connectionSettingName);
        maskValue(context, binding.triggerConfigSettingName);
        return binding;
    }
}

export function getPollingConnectorBindingsFromFunctionJson(
    data: unknown,
    functionName?: string,
): BindingCandidate[] {
    if (!isRecord(data) || !Array.isArray(data.bindings)) {
        return [];
    }

    return data.bindings.flatMap(bindingValue => {
        const binding = isRecord(bindingValue) ? bindingValue : undefined;
        if (!binding ||
            !equalsIgnoreCase(readString(binding.type), 'connectorTrigger') ||
            !equalsIgnoreCase(readString(binding.deliveryMode), 'Poll')) {
            return [];
        }
        return createBindingCandidate(
            readString(binding.connection),
            readString(binding.triggerConfigName),
            functionName,
        );
    });
}

export function getPollingConnectorBindings(content: string): BindingCandidate[] {
    return [
        ...getBindingsFromBlocks(
            content,
            /\[Function\(\s*["']([^"']+)["']\s*\)\][\s\S]*?\[\s*ConnectorTrigger\s*\(([\s\S]*?)\)\s*\]/gi,
            /DeliveryMode\s*=\s*(?:\w+\.)*Poll\b/i,
            /Connection\s*=\s*["']([^"']+)["']/i,
            /TriggerConfigName\s*=\s*["']([^"']+)["']/i,
        ),
        ...getBindingsFromBlocks(
            content,
            /@(?:\w+\.)?function_name\s*\(\s*name\s*=\s*["']([^"']+)["']\s*\)[\s\S]*?@(?:\w+\.)?connector_trigger\s*\(([\s\S]*?)\)\s*(?:\r?\n)/gi,
            /delivery_mode\s*=\s*(?:\w+\.)*POLL\b/i,
            /connection\s*=\s*["']([^"']+)["']/i,
            /trigger_config_name\s*=\s*["']([^"']+)["']/i,
        ),
        ...getBindingsFromBlocks(
            content,
            /\b(?:app\.)?connectorTrigger\s*\(\s*["']([^"']+)["']\s*,\s*\{([\s\S]*?)\bhandler\s*:/gi,
            /deliveryMode\s*:\s*["']Poll["']/i,
            /connection\s*:\s*["']([^"']+)["']/i,
            /triggerConfigName\s*:\s*["']([^"']+)["']/i,
        ),
    ];
}

export function selectPollingConnectorBinding(
    candidates: readonly BindingCandidate[],
    operationId: string,
): ConnectorTriggerLocalBinding {
    const unique = deduplicateBindings(candidates);
    const matching = unique.filter(candidate =>
        candidate.functionName &&
        normalizeOperationName(candidate.functionName) === normalizeOperationName(operationId));
    const selected = matching.length === 1 ?
        matching[0] :
        matching.length === 0 && unique.length === 1 ?
            unique[0] :
            undefined;
    if (!selected) {
        throw new Error(unique.length === 0 ?
            localize(
                'connectorTriggerBindingMissing',
                'The selected project does not contain explicit Poll binding settings for this Connector Trigger.',
            ) :
            localize(
                'connectorTriggerBindingAmbiguous',
                'The selected Connector Trigger matches multiple Poll bindings. Make the binding metadata unambiguous, then retry debugging.',
            ));
    }
    return {
        connectionSettingName: selected.connectionSettingName,
        triggerConfigSettingName: selected.triggerConfigSettingName,
    };
}

function getBindingsFromBlocks(
    content: string,
    blockPattern: RegExp,
    pollPattern: RegExp,
    connectionPattern: RegExp,
    triggerConfigPattern: RegExp,
): BindingCandidate[] {
    const bindings: BindingCandidate[] = [];
    for (const match of content.matchAll(blockPattern)) {
        const block = match[2];
        if (!pollPattern.test(block)) {
            continue;
        }
        bindings.push(...createBindingCandidate(
            connectionPattern.exec(block)?.[1],
            triggerConfigPattern.exec(block)?.[1],
            match[1],
        ));
    }
    return bindings;
}

function createBindingCandidate(
    connectionSettingName: string | undefined,
    triggerConfigReference: string | undefined,
    functionName?: string,
): BindingCandidate[] {
    const triggerConfigSettingName = parseSettingReference(triggerConfigReference);
    if (!connectionSettingName?.trim() || !triggerConfigSettingName) {
        return [];
    }
    return [{
        connectionSettingName: connectionSettingName.trim(),
        triggerConfigSettingName,
        ...(functionName?.trim() ? { functionName: functionName.trim() } : {}),
    }];
}

function parseSettingReference(value: string | undefined): string | undefined {
    const match = value?.trim().match(/^%([^%]+)%$/);
    return match?.[1]?.trim() || undefined;
}

function deduplicateBindings(candidates: readonly BindingCandidate[]): BindingCandidate[] {
    const seen = new Set<string>();
    return candidates.filter(candidate => {
        const key = [
            candidate.functionName?.toLowerCase() ?? '',
            candidate.connectionSettingName.toLowerCase(),
            candidate.triggerConfigSettingName.toLowerCase(),
        ].join('\0');
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function normalizeOperationName(value: string): string {
    return value
        .replace(/v\d+$/i, '')
        .replace(/[^a-z\d]/gi, '')
        .toLowerCase();
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function equalsIgnoreCase(left: string | undefined, right: string): boolean {
    return typeof left === 'string' && left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function maskValue(context: IActionContext, value: string): void {
    if (!context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}
