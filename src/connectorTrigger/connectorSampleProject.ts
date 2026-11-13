/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType } from 'vscode';
import { hostFileName } from '../constants';

const pollingFolderName = 'polling';
const webhookFolderName = 'webhook';
const ignoredDirectories = new Set(['.git', 'node_modules', '.venv', 'bin', 'obj']);

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
export async function getConnectorSampleOperationFunctions(projectPath: string): Promise<Map<string, string>> {
    const operations = new Map<string, string>();
    const infraPath = path.join(projectPath, 'infra');
    if (!await AzExtFsExtra.pathExists(infraPath)) {
        return operations;
    }
    for (const file of await findFiles(infraPath, name => /\.(?:json|bicep)$/i.test(name))) {
        for (const [operationId, functionName] of parseOperationFunctions(await AzExtFsExtra.readFile(file))) {
            if (!operations.has(operationId.toLowerCase())) {
                operations.set(operationId.toLowerCase(), functionName);
            }
        }
    }
    return operations;
}

export function parseOperationFunctions(content: string): [string, string][] {
    const pairs: [string, string][] = [];
    const keys = [...content.matchAll(/\bfunctionName['"]?\s*:/g)];
    for (const [index, key] of keys.entries()) {
        // Bound each entry by the next functionName key so pairs never cross entries.
        const entry = content.slice(key.index, keys[index + 1]?.index ?? content.length);
        const functionName = /^functionName['"]?\s*:\s*['"]([A-Za-z_][\w-]*)['"]/.exec(entry)?.[1];
        const operationId = /\boperationName['"]?\s*:\s*['"]([^'"\s]+)['"]/.exec(entry)?.[1];
        if (functionName && operationId) {
            pairs.push([operationId, functionName]);
        }
    }
    return pairs;
}

/**
 * Returns the function names that appear as string literals in the sample's source files.
 * Some samples register functions in loops, so this checks for the name rather than parsing registrations.
 */
export async function findConnectorSampleFunctionNames(projectPath: string, functionNames: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    const sourceFiles = await findFiles(projectPath, name => /\.(?:cs|py|[cm]?[jt]s)$/i.test(name) && !name.endsWith('.d.ts'),
        relative => relative.toLowerCase() === 'infra');
    for (const file of sourceFiles) {
        const content = await AzExtFsExtra.readFile(file);
        for (const name of functionNames) {
            if (!found.has(name) && (content.includes(`"${name}"`) || content.includes(`'${name}'`))) {
                found.add(name);
            }
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
