/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as path from 'path';
import { localize } from '../localize';

/**
 * Checks declared hook files and statically referenced helpers without running sample code.
 * This is a packaging check, not a shell interpreter or a deployment verification.
 */
export async function validateConnectorSampleDeployment(projectPath: string): Promise<void> {
    const manifestPath = path.join(projectPath, 'azure.yaml');
    if (!await AzExtFsExtra.pathExists(manifestPath)) {
        return;
    }
    const { parseDocument } = await import('yaml');
    const document = parseDocument(await AzExtFsExtra.readFile(manifestPath), { logLevel: 'silent' });
    if (document.errors.length) {
        throw invalidHooks();
    }
    let manifest: unknown;
    try {
        manifest = document.toJS({ maxAliasCount: 100 });
    } catch {
        throw invalidHooks();
    }
    if (!isRecord(manifest)) {
        throw invalidHooks();
    }
    const checked = new Set<string>();
    const requireFile = async (file: string): Promise<void> => {
        const relative = path.relative(projectPath, file);
        const segments = relative.split(path.sep);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ||
            segments.some(segment => segment === '.git')) {
            throw missingHookFile();
        }
        for (let i = 0; i < segments.length; i++) {
            const entry = path.join(projectPath, ...segments.slice(0, i + 1));
            if (!await AzExtFsExtra.pathExists(entry)) {
                throw missingHookFile();
            }
            const stat = await fs.promises.lstat(entry);
            if (i === segments.length - 1 ? !stat.isFile() : !stat.isDirectory()) {
                throw missingHookFile();
            }
        }
        if (checked.has(file)) {
            return;
        }
        checked.add(file);
        if (/\.(?:[cm]?js|py|ps1|sh)$/i.test(file)) {
            for (const reference of getScriptReferences(await AzExtFsExtra.readFile(file))) {
                await requireFile(path.resolve(path.dirname(file), normalizePath(reference)));
            }
        }
    };
    const validateHooks = async (hooks: unknown, workingDirectory: string): Promise<void> => {
        if (hooks === undefined) {
            return;
        }
        if (!isRecord(hooks)) {
            throw invalidHooks();
        }
        for (const hook of Object.values(hooks)) {
            if (!isRecord(hook)) {
                throw invalidHooks();
            }
            for (const definition of [hook, hook.windows, hook.posix]) {
                if (definition === undefined) {
                    continue;
                }
                if (!isRecord(definition) || (definition.run !== undefined && typeof definition.run !== 'string')) {
                    throw invalidHooks();
                }
                if (typeof definition.run === 'string') {
                    // A hook may be an inline command, a script path, or an interpreter plus a script.
                    for (const reference of getHookScriptReferences(definition.run)) {
                        await requireFile(path.resolve(workingDirectory, normalizePath(reference)));
                    }
                }
            }
            if (hook.run === undefined && hook.windows === undefined && hook.posix === undefined) {
                throw invalidHooks();
            }
        }
    };
    await validateHooks(manifest.hooks, projectPath);
    if (manifest.services !== undefined) {
        if (!isRecord(manifest.services)) {
            throw invalidHooks();
        }
        for (const service of Object.values(manifest.services)) {
            if (!isRecord(service) || (service.project !== undefined && typeof service.project !== 'string')) {
                throw invalidHooks();
            }
            await validateHooks(service.hooks, path.resolve(projectPath, normalizePath(service.project ?? '.')));
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidHooks(): Error {
    return new Error(localize('connectorSampleHooksInvalid',
        'The connector sample has invalid deployment hooks in azure.yaml. Fix the sample manifest before retrying.'));
}

function missingHookFile(): Error {
    return new Error(localize('connectorSampleHookFileMissing',
        'The connector sample deployment hooks reference a missing file or a file outside the copied Functions project. Use a self-contained sample or fix its upstream hook dependencies before retrying.'));
}

function normalizePath(value: string): string {
    return value.replace(/[\\/]/g, path.sep);
}

function getHookScriptReferences(command: string): string[] {
    const references: string[] = [];
    for (const match of command.matchAll(/"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s;&|()<>]+)/g)) {
        const token = match[1] ?? match[2] ?? match[3];
        if (/^[\w:./\\ -]+\.(?:[cm]?js|py|ps1|sh)$/i.test(token) || /^\.\.?[\\/][^\r\n]+$/.test(token)) {
            references.push(token);
        }
    }
    return references;
}

function getScriptReferences(content: string): string[] {
    const references: string[] = [];
    // ES module imports and module-relative data files used by the Node hooks.
    for (const pattern of [
        /\b(?:from\s*|import\s*\(\s*|import\s*)['"](\.[^'"\r\n]+)['"]/g,
        /\bnew\s+URL\(\s*['"](\.[^'"\r\n]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
        /\bJoin-Path\s+\$PSScriptRoot\s+['"]([^'"\r\n]+\.(?:ps1|sh|py))['"]/gi,
        /["']\$(?:script_dir|\{script_dir\}|PSScriptRoot)[\\/]([^'"\r\n]+\.(?:ps1|sh|py))["']/gi,
        // Bash wrappers also source helpers via an inline dirname expression.
        /^\s*(?:source|\.)\s+"[^\r\n]*(?:BASH_SOURCE\[0\]|\$0)[^\r\n]*&&\s*pwd\)[\\/]([^"\r\n]+\.sh)"/gm,
    ]) {
        for (const match of content.matchAll(pattern)) {
            references.push(match[1]);
        }
    }
    return references;
}
