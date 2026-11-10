/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseJson } from '../utils/parseJson';

const excludedFolders = '**/{.git,node_modules,.venv,venv,bin,obj,dist,out}/**';
const connectorSourceGlob = '**/*.{cs,py,js,ts}';
const connectorCallPattern = /\b(?:(?:app\.)?connectorTrigger(?:<[^()\r\n]+>)?|connectors(?:\.[A-Za-z_$][\w$]*){2})\s*\(\s*["']([^"']+)["']\s*,\s*/gi;
const structuralTokenPattern = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|[{}()[\],]/g;
const pythonTokenPattern = /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\r\n]*/g;

export interface ConnectorTriggerBindingCandidate {
    connectionSettingName: string;
    functionName?: string;
    triggerConfigSettingName: string;
}

interface PollingConnectorSourceBinding {
    binding: ConnectorTriggerBindingCandidate;
    index: number;
}

export async function findConnectorTriggerRegistrations(
    projectPath: string,
): Promise<string[]> {
    return await findRegistrations(
        projectPath,
        getConnectorTriggerRegistrationCountFromFunctionJson,
        getConnectorTriggerRegistrations,
    );
}

export async function findNonPollingFunctionRegistrations(
    projectPath: string,
): Promise<string[]> {
    return await findRegistrations(
        projectPath,
        data => getPollingConnectorBindingsFromFunctionJson(data).length === 0 ? 1 : 0,
        getNonPollingFunctionRegistrations,
    );
}

async function findRegistrations(
    projectPath: string,
    getFunctionJsonCount: (data: unknown) => number,
    getSourceRegistrations: (content: string, extension: string) => string[],
): Promise<string[]> {
    const registrations: string[] = [];
    const functionJsonFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath, '**/function.json'),
        excludedFolders,
    );
    for (const file of functionJsonFiles) {
        const data = parseJson((await AzExtFsExtra.readFile(file.fsPath)).toString());
        const count = getFunctionJsonCount(data);
        for (let index = 0; index < count; index++) {
            registrations.push(path.basename(path.dirname(file.fsPath)));
        }
    }

    const sourceFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath, connectorSourceGlob),
        excludedFolders,
    );
    for (const file of sourceFiles) {
        const content = (await AzExtFsExtra.readFile(file.fsPath)).toString();
        registrations.push(...getSourceRegistrations(content, path.extname(file.fsPath).toLowerCase()));
    }
    return registrations;
}

export async function findPollingConnectorBindings(
    projectPath: string,
): Promise<ConnectorTriggerBindingCandidate[]> {
    const candidates: ConnectorTriggerBindingCandidate[] = [];
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
    return deduplicateBindings(candidates);
}

export function getConnectorTriggerRegistrations(content: string): string[] {
    return [
        ...getAttributedConnectorBlocks(content).map(block => block.functionName),
        ...getRegistrationNames(
            content,
            /\b(?:(?:app\.)?connectorTrigger(?:<[^()\r\n]+>)?|connectors(?:\.[A-Za-z_$][\w$]*){2})\s*\(\s*["']([^"']+)["']/gi,
        ),
    ];
}

export function getPollingConnectorBindingsFromFunctionJson(
    data: unknown,
    functionName?: string,
): ConnectorTriggerBindingCandidate[] {
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

export function getPollingConnectorBindings(
    content: string,
): ConnectorTriggerBindingCandidate[] {
    return getPollingConnectorSourceBindings(content).map(candidate => candidate.binding);
}

function getPollingConnectorSourceBindings(content: string): PollingConnectorSourceBinding[] {
    return [
        ...getAttributedConnectorBlocks(content).flatMap(({ functionName, options, index }) => {
            if (!/delivery_?mode\s*=\s*(?:\w+\.)*Poll\b/i.test(options)) {
                return [];
            }
            return createBindingCandidate(
                /connection\s*=\s*["']([^"']+)["']/i.exec(options)?.[1],
                /trigger_?config_?name\s*=\s*["']([^"']+)["']/i.exec(options)?.[1],
                functionName,
            ).map(binding => ({ binding, index }));
        }),
        ...getTypeScriptBindings(content),
    ];
}

function getConnectorTriggerRegistrationCountFromFunctionJson(data: unknown): number {
    if (!isRecord(data) || !Array.isArray(data.bindings)) {
        return 0;
    }
    return data.bindings.filter(bindingValue => {
        const binding = isRecord(bindingValue) ? bindingValue : undefined;
        return binding &&
            equalsIgnoreCase(readString(binding.type), 'connectorTrigger');
    }).length;
}

function getRegistrationNames(content: string, pattern: RegExp): string[] {
    return [...content.matchAll(pattern)].map(match => match[1]);
}

function getNonPollingFunctionRegistrations(content: string, extension: string): string[] {
    const pollingIndexes = new Set(getPollingConnectorSourceBindings(content).map(candidate => candidate.index));
    return getFunctionRegistrations(content, extension)
        .filter(registration => !pollingIndexes.has(registration.index))
        .map(registration => registration.functionName);
}

function getFunctionRegistrations(
    content: string,
    extension: string,
): { functionName: string; index: number }[] {
    // Mask literals/comments without moving declaration offsets.
    const code = content.replace(
        extension === '.py' ? pythonTokenPattern : structuralTokenPattern,
        token => /^["'`#\/]/.test(token) ? token.replace(/[^\r\n]/g, ' ') : token,
    );
    if (extension === '.py') {
        return [...code.matchAll(/^[ \t]*@[\s\S]*?^[ \t]*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm)]
            .flatMap(block => {
                const decorator = /@(?:\w+\.)?function_name\s*\(/.exec(block[0]);
                const functionName = decorator
                    ? readFunctionNameArgument(content.slice(block.index + decorator.index + decorator[0].length))
                    : /@(?:\w+\.)?(?:route|schedule|\w+_trigger)\s*\(/.test(block[0]) ? block[1] : undefined;
                return functionName ? [{ functionName, index: block.index }] : [];
            });
    }

    const declarationPattern = extension === '.cs'
        ? /\[\s*(?:\w+\.)*(?:Function|FunctionName)(?:Attribute)?\s*\(/g
        : /\b(?:app\.[A-Za-z_$][\w$]*(?:<[^()\r\n]+>)?|connectorTrigger(?:<[^()\r\n]+>)?|connectors(?:\.[A-Za-z_$][\w$]*){2})\s*\(/g;
    return [...code.matchAll(declarationPattern)].flatMap(match => {
        const argument = content.slice(match.index + match[0].length);
        const functionName = readFunctionNameArgument(argument) ??
            (extension === '.cs' ? /^\s*nameof\(\s*(?:\w+\.)*(\w+)\s*\)/.exec(argument)?.[1] : undefined);
        return functionName ? [{ functionName, index: match.index }] : [];
    });
}

function readFunctionNameArgument(content: string): string | undefined {
    return /^\s*(?:name\s*[=:]\s*)?["'`]([^"'`\r\n]+)["'`]/.exec(content)?.[1];
}

function getAttributedConnectorBlocks(content: string): { functionName: string; options: string; index: number }[] {
    const blocks: { functionName: string; options: string; index: number }[] = [];
    // Stop at the method body (including expression bodies), never at a later function's trigger.
    for (const match of content.matchAll(/\[Function\(\s*["']([^"']+)["']\s*\)\]((?:(?!=>|\[Function\s*\()[^{])*?)(?=\{|=>)/gi)) {
        const options = /\[\s*ConnectorTrigger\s*\(([\s\S]*?)\)\s*\]/i.exec(match[2])?.[1];
        if (options) {
            blocks.push({ functionName: match[1], options, index: match.index });
        }
    }
    for (const match of content.matchAll(/^[ \t]*@[\s\S]*?(?=^[ \t]*(?:async\s+)?def\b)/gm)) {
        const functionName = /@(?:\w+\.)?function_name\s*\(\s*name\s*=\s*["']([^"']+)["']\s*\)/i.exec(match[0])?.[1];
        const options = /@(?:\w+\.)?connector_trigger\s*\(([\s\S]*?)\)\s*(?:\r?\n)/i.exec(match[0])?.[1];
        if (functionName && options) {
            blocks.push({ functionName, options, index: match.index });
        }
    }
    return blocks;
}

function getTypeScriptBindings(
    content: string,
): PollingConnectorSourceBinding[] {
    const namedOptions = new Map<string, string>();
    for (const match of content.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?=\{)/gi)) {
        const options = readOptionsObject(content.slice(match.index + match[0].length));
        if (options !== undefined) {
            namedOptions.set(match[1], options);
        }
    }

    const bindings: PollingConnectorSourceBinding[] = [];
    for (const match of content.matchAll(connectorCallPattern)) {
        const argument = content.slice(match.index + match[0].length);
        const name = /^([A-Za-z_$][\w$]*)\s*,?\s*\)/.exec(argument)?.[1];
        const options = name ? namedOptions.get(name) : readOptionsObject(argument);
        if (options === undefined) {
            continue;
        }
        const properties = new Map(splitTopLevelProperties(options).flatMap(property => {
            const withoutComments = property.replace(structuralTokenPattern,
                token => token.startsWith('//') || token.startsWith('/*') ? ' ' : token);
            const value = /^\s*(?:([A-Za-z_$][\w$]*)|["']([^"']+)["'])\s*:\s*(["'])(.*?)\3\s*$/.exec(withoutComments);
            return value ? [[value[1] ?? value[2], value[4]] as const] : [];
        }));
        if (!equalsIgnoreCase(properties.get('deliveryMode'), 'Poll')) {
            continue;
        }
        bindings.push(...createBindingCandidate(
            properties.get('connection'),
            properties.get('triggerConfigName'),
            match[1],
        ).map(binding => ({ binding, index: match.index })));
    }
    return bindings;
}

// Skip literals/comments and balance nested expressions so handlers cannot supply binding settings.
function getStructuralTokens(content: string): IterableIterator<RegExpExecArray> {
    return content.matchAll(structuralTokenPattern);
}

function readOptionsObject(content: string): string | undefined {
    if (!content.startsWith('{')) {
        return undefined;
    }
    let depth = 0;
    for (const token of getStructuralTokens(content)) {
        if (token[0] === '{') {
            depth++;
        } else if (token[0] === '}' && --depth === 0) {
            return content.slice(1, token.index);
        }
    }
    return undefined;
}

function splitTopLevelProperties(content: string): string[] {
    const properties: string[] = [];
    let depth = 0;
    let start = 0;
    for (const token of getStructuralTokens(content)) {
        if (/^[{([]$/.test(token[0])) {
            depth++;
        } else if (/^[})\]]$/.test(token[0])) {
            depth--;
        } else if (token[0] === ',' && depth === 0) {
            properties.push(content.slice(start, token.index));
            start = token.index + 1;
        }
    }
    properties.push(content.slice(start));
    return properties;
}

function createBindingCandidate(
    connectionSettingName: string | undefined,
    triggerConfigReference: string | undefined,
    functionName?: string,
): ConnectorTriggerBindingCandidate[] {
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

function deduplicateBindings(
    candidates: readonly ConnectorTriggerBindingCandidate[],
): ConnectorTriggerBindingCandidate[] {
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

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function equalsIgnoreCase(left: string | undefined, right: string): boolean {
    return typeof left === 'string' &&
        left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
