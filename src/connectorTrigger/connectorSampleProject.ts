/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType } from 'vscode';
import * as jsonc from 'jsonc-parser';
import { hostFileName } from '../constants';
import { parseJson } from '../utils/parseJson';
import { getConnectorTriggerRegistrations } from './connectorTriggerBindings';

const pollingFolderName = 'polling';
const webhookFolderName = 'webhook';
const ignoredDirectories = new Set(['.git', 'node_modules', '.venv', 'venv', 'bin', 'obj', 'dist', 'out']);

/**
 * Resolves the Poll Functions project inside a downloaded connector sample folder.
 * Samples keep separate `polling` and `webhook` projects beneath each connector folder.
 */
export async function resolveConnectorSampleProjectFolder(folder: string): Promise<string | undefined> {
    if (await AzExtFsExtra.pathExists(path.join(folder, hostFileName))) {
        return folder;
    }
    const projects: string[] = [];
    for (const entry of await AzExtFsExtra.readDirectory(folder)) {
        if (entry.type === FileType.Directory && entry.name.toLowerCase() !== webhookFolderName &&
            await AzExtFsExtra.pathExists(path.join(folder, entry.name, hostFileName))) {
            projects.push(entry.name);
        }
    }
    const polling = projects.find(name => name.toLowerCase() === pollingFolderName);
    const project = polling ?? (projects.length === 1 ? projects[0] : undefined);
    return project ? path.join(folder, project) : undefined;
}

/**
 * Reads the sample's operation-to-function map from its infrastructure files, where each
 * Poll trigger declares a `functionName` and the connector `operationName` it subscribes to.
 */
export async function getConnectorSampleOperationFunctions(projectPath: string, onInvalidJson?: () => void): Promise<Map<string, string>> {
    const operations = new Map<string, string>();
    const infraPath = path.join(projectPath, 'infra');
    if (!await AzExtFsExtra.pathExists(infraPath)) {
        return operations;
    }
    for (const file of await findFiles(infraPath, name => /\.(?:json|bicep)$/i.test(name))) {
        const format = path.extname(file).toLowerCase() === '.json' ? 'json' : 'bicep';
        const content = await AzExtFsExtra.readFile(file);
        const pairs = format === 'json' && onInvalidJson ?
            tryParseJsonOperationFunctions(content, onInvalidJson) :
            parseOperationFunctions(content, format);
        for (const [operationId, functionName] of pairs) {
            if (!operations.has(operationId.toLowerCase())) {
                operations.set(operationId.toLowerCase(), functionName);
            }
        }
    }
    return operations;
}

export function parseOperationFunctions(content: string, format: 'json' | 'bicep'): [string, string][] {
    return format === 'json' ? parseJsonOperationFunctions(content) : parseBicepOperationFunctions(content);
}

function parseJsonOperationFunctions(content: string): [string, string][] {
    return collectJsonOperationFunctions(parseJson<object>(content));
}

function tryParseJsonOperationFunctions(content: string, onInvalidJson: () => void): [string, string][] {
    const errors: jsonc.ParseError[] = [];
    const parsed: unknown = jsonc.parse(content.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true });
    if (errors.length > 0) {
        onInvalidJson();
        return [];
    }
    return collectJsonOperationFunctions(parsed);
}

function collectJsonOperationFunctions(value: unknown): [string, string][] {
    const pairs: [string, string][] = [];
    const pending: unknown[] = [value];
    while (pending.length) {
        const value = pending.pop();
        if (Array.isArray(value)) {
            for (let i = value.length - 1; i >= 0; i--) {
                pending.push(value[i]);
            }
        } else if (isRecord(value)) {
            addOperationFunction(pairs, value.operationName, value.functionName);
            const children = Object.values(value);
            for (let i = children.length - 1; i >= 0; i--) {
                pending.push(children[i]);
            }
        }
    }
    return pairs;
}

function parseBicepOperationFunctions(content: string): [string, string][] {
    const tokens = [...content.matchAll(/'''[\s\S]*?'''|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[A-Za-z_]\w*|[{}:]|\S/g)]
        .filter(token => !token[0].startsWith('//') && !token[0].startsWith('/*'));
    const stack: { offset: number; operationName?: string; functionName?: string }[] = [];
    const found: { offset: number; pair: [string, string] }[] = [];
    for (const [index, token] of tokens.entries()) {
        if (token[0] === '{') {
            stack.push({ offset: token.index });
        } else if (token[0] === '}') {
            const object = stack.pop();
            if (object) {
                const pairs: [string, string][] = [];
                addOperationFunction(pairs, object.operationName, object.functionName);
                if (pairs.length) {
                    found.push({ offset: object.offset, pair: pairs[0] });
                }
            }
        } else if (stack.length && tokens[index + 1]?.[0] === ':' && tokens[index - 1]?.[0] !== '?') {
            const key = readBicepString(token[0]) ?? token[0];
            const value = readBicepString(tokens[index + 2]?.[0]);
            if ((key === 'operationName' || key === 'functionName') && value !== undefined) {
                stack[stack.length - 1][key] = value;
            }
        }
    }
    return found.sort((left, right) => left.offset - right.offset).map(item => item.pair);
}

function readBicepString(token: string | undefined): string | undefined {
    if (!token || token.length < 2 || !/^(['"]).*\1$/s.test(token) || token.startsWith("'''")) {
        return undefined;
    }
    const value = token.slice(1, -1);
    return value.includes('\\') || value.includes('${') ? undefined : value;
}

function addOperationFunction(pairs: [string, string][], operationName: unknown, functionName: unknown): void {
    if (typeof operationName === 'string' && /^[^'"\s]+$/.test(operationName) &&
        typeof functionName === 'string' && /^[A-Za-z_][\w-]*$/.test(functionName)) {
        pairs.push([operationName, functionName]);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Finds sample handlers by registration, falling back to string literals for functions registered in loops.
 */
export async function findConnectorSampleFunctionPaths(projectPath: string, functionNames: string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    const fallback = new Map<string, string>();
    const sourceFiles = await findFiles(projectPath, name => /\.(?:cs|py|[cm]?[jt]s)$/i.test(name) && !name.endsWith('.d.ts'),
        relative => relative.toLowerCase() === 'infra');
    for (const file of sourceFiles) {
        const content = await AzExtFsExtra.readFile(file);
        const registrations = getConnectorTriggerRegistrations(content, path.extname(file).toLowerCase());
        for (const name of functionNames) {
            if (!found.has(name) && registrations.includes(name)) {
                found.set(name, file);
            }
            if (!fallback.has(name) && (content.includes(`"${name}"`) || content.includes(`'${name}'`))) {
                fallback.set(name, file);
            }
        }
    }
    for (const [name, file] of fallback) {
        if (!found.has(name)) {
            found.set(name, file);
        }
    }
    return found;
}

async function findFiles(root: string, include: (name: string) => boolean, skipDirectory?: (relative: string) => boolean): Promise<string[]> {
    const files: string[] = [];
    const visit = async (directory: string, relative: string): Promise<void> => {
        for (const entry of await AzExtFsExtra.readDirectory(directory)) {
            const entryRelative = relative ? path.join(relative, entry.name) : entry.name;
            if (entry.type === FileType.Directory) {
                if (!ignoredDirectories.has(entry.name.toLowerCase()) && !skipDirectory?.(entryRelative)) {
                    await visit(path.join(directory, entry.name), entryRelative);
                }
            } else if (entry.type === FileType.File && include(entry.name)) {
                files.push(path.join(directory, entry.name));
            }
        }
    };
    await visit(root, '');
    return files;
}
