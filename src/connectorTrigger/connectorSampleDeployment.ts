/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as path from 'path';
import { localize } from '../localize';

export interface ConnectorSampleHookIssue {
    /** azd hook name, prefixed with the service name for service hooks. */
    hook: string;
    /** Sample-relative file whose reference could not be resolved. */
    referencedBy: string;
    /** Reference exactly as written in the sample. */
    reference: string;
}

export interface ConnectorSampleDeploymentPreparation {
    /** References that could not be resolved inside the project or bundled from the sample. */
    issues: ConnectorSampleHookIssue[];
    /** Sample-relative helpers copied into the project so hook scripts resolve them locally. */
    bundledFiles: string[];
}

/**
 * Checks declared hook files and statically referenced helpers without running sample code.
 * References outside the project but inside the downloaded sample are copied into the project and rewritten.
 * This is a packaging step, not a shell interpreter or a deployment verification. Invalid manifests throw;
 * unresolved references are returned so creation can continue.
 */
export async function prepareConnectorSampleDeployment(projectPath: string, sampleRoot: string = projectPath): Promise<ConnectorSampleDeploymentPreparation> {
    const issues: ConnectorSampleHookIssue[] = [];
    const bundledFiles: string[] = [];
    const manifestPath = path.join(projectPath, 'azure.yaml');
    if (!await AzExtFsExtra.pathExists(manifestPath)) {
        return { issues, bundledFiles };
    }
    const { isScalar, parseDocument } = await import('yaml');
    const manifestContent = await AzExtFsExtra.readFile(manifestPath);
    const document = parseDocument(manifestContent, { logLevel: 'silent' });
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
    const checked = new Map<string, string>();
    const reported = new Set<string>();
    const manifestEdits: { start: number; end: number; value: string }[] = [];
    const canBundle = isContained(sampleRoot, projectPath) && await isAvailableFile(sampleRoot, projectPath, true);
    const copyHelper = async (helper: string, target: string): Promise<boolean> => {
        if (!canBundle || !await isAvailableFile(sampleRoot, helper)) {
            return false;
        }
        const previousSource = checked.get(target);
        if (previousSource) {
            return previousSource === helper;
        }
        if (await AzExtFsExtra.pathExists(target)) {
            if (!await isAvailableFile(projectPath, target) ||
                !(await fs.promises.readFile(target)).equals(await fs.promises.readFile(helper))) {
                return false;
            }
        } else {
            await AzExtFsExtra.copy(helper, target, { overwrite: false });
            bundledFiles.push(toPosix(path.relative(sampleRoot, helper)));
        }
        return true;
    };
    const bundle = async (referencingFile: string, reference: string, helper: string): Promise<string | undefined> => {
        const target = path.join(path.dirname(referencingFile), path.basename(helper));
        if (!await copyHelper(helper, target)) {
            return undefined;
        }
        const content = await AzExtFsExtra.readFile(referencingFile);
        const targetReference = /\.[cm]?js$/i.test(referencingFile) ? `./${path.basename(helper)}` : path.basename(helper);
        await AzExtFsExtra.writeFile(referencingFile, content.split(reference).join(targetReference));
        return target;
    };
    const reportIssue = (hook: string, referencingFile: string | undefined, reference: string): void => {
        const issue: ConnectorSampleHookIssue = {
            hook,
            referencedBy: referencingFile ? toPosix(path.relative(projectPath, referencingFile)) : 'azure.yaml',
            reference,
        };
        const key = JSON.stringify(issue);
        if (!reported.has(key)) {
            reported.add(key);
            issues.push(issue);
        }
    };
    const requireFile = async (
        hook: string, referencingFile: string | undefined, reference: string, file: string, sourceFile: string = file,
        bundleDeclaredHook?: (helper: string) => Promise<string | undefined>,
    ): Promise<void> => {
        if (!await isAvailableFile(projectPath, file)) {
            const bundled = referencingFile
                ? await bundle(referencingFile, reference, sourceFile)
                : await bundleDeclaredHook?.(sourceFile);
            if (!bundled) {
                reportIssue(hook, referencingFile, reference);
                return;
            }
            file = bundled;
        }
        const previousSource = checked.get(file);
        if (previousSource) {
            if (previousSource !== sourceFile) {
                reportIssue(hook, referencingFile, reference);
            }
            return;
        }
        if (file !== sourceFile && (!await isAvailableFile(sampleRoot, sourceFile) ||
            !(await fs.promises.readFile(file)).equals(await fs.promises.readFile(sourceFile)))) {
            reportIssue(hook, referencingFile, reference);
            return;
        }
        checked.set(file, sourceFile);
        if (/\.(?:[cm]?js|py|ps1|sh)$/i.test(file)) {
            for (const nested of getScriptReferences(await AzExtFsExtra.readFile(file))) {
                await requireFile(hook, file, nested, path.resolve(path.dirname(file), normalizePath(nested)),
                    path.resolve(path.dirname(sourceFile), normalizePath(nested)));
            }
        }
    };
    const validateHooks = async (hooks: unknown, workingDirectory: string, prefix: string, hooksPath: string[]): Promise<void> => {
        if (hooks === undefined) {
            return;
        }
        if (!isRecord(hooks)) {
            throw invalidHooks();
        }
        for (const [hookName, hook] of Object.entries(hooks)) {
            if (!isRecord(hook)) {
                throw invalidHooks();
            }
            for (const [platform, definition] of [['', hook], ['windows', hook.windows], ['posix', hook.posix]] as const) {
                if (definition === undefined) {
                    continue;
                }
                if (!isRecord(definition) || (definition.run !== undefined && typeof definition.run !== 'string')) {
                    throw invalidHooks();
                }
                if (typeof definition.run === 'string') {
                    const runPath = [...hooksPath, hookName, ...(platform ? [platform] : []), 'run'];
                    const runNode = document.getIn(runPath, true);
                    const range = isScalar(runNode) ? runNode.range : undefined;
                    let rawRun = range ? manifestContent.slice(range[0], range[1]) : undefined;
                    // A hook may be an inline command, a script path, or an interpreter plus a script.
                    for (const reference of getHookScriptReferences(definition.run)) {
                        const bundleDeclaredHook = async (helper: string): Promise<string | undefined> => {
                            if (!rawRun || !await isAvailableFile(projectPath, workingDirectory, true)) {
                                return undefined;
                            }
                            const target = path.join(workingDirectory, path.basename(helper));
                            const rewritten = replaceHookReference(rawRun, reference, `./${path.basename(helper)}`);
                            if (rewritten === rawRun || !await copyHelper(helper, target)) {
                                return undefined;
                            }
                            rawRun = rewritten;
                            return target;
                        };
                        await requireFile(prefix + hookName, undefined, reference,
                            path.resolve(workingDirectory, normalizePath(reference)), undefined, bundleDeclaredHook);
                    }
                    if (range && rawRun !== undefined && rawRun !== manifestContent.slice(range[0], range[1])) {
                        manifestEdits.push({ start: range[0], end: range[1], value: rawRun });
                    }
                }
            }
            if (hook.run === undefined && hook.windows === undefined && hook.posix === undefined) {
                throw invalidHooks();
            }
        }
    };
    await validateHooks(manifest.hooks, projectPath, '', ['hooks']);
    if (manifest.services !== undefined) {
        if (!isRecord(manifest.services)) {
            throw invalidHooks();
        }
        for (const [serviceName, service] of Object.entries(manifest.services)) {
            if (!isRecord(service) || (service.project !== undefined && typeof service.project !== 'string')) {
                throw invalidHooks();
            }
            await validateHooks(service.hooks, path.resolve(projectPath, normalizePath(service.project ?? '.')),
                `${serviceName}.`, ['services', serviceName, 'hooks']);
        }
    }
    if (isRecord(manifest.infra) && manifest.infra.layers !== undefined) {
        if (!Array.isArray(manifest.infra.layers)) {
            throw invalidHooks();
        }
        for (const [index, layer] of manifest.infra.layers.entries()) {
            if (!isRecord(layer) || typeof layer.name !== 'string' || typeof layer.path !== 'string') {
                throw invalidHooks();
            }
            await validateHooks(layer.hooks, path.resolve(projectPath, normalizePath(layer.path)),
                `infra.${layer.name}.`, ['infra', 'layers', String(index), 'hooks']);
        }
    }
    if (manifestEdits.length) {
        let updatedManifest = manifestContent;
        for (const edit of manifestEdits.sort((a, b) => b.start - a.start)) {
            updatedManifest = updatedManifest.slice(0, edit.start) + edit.value + updatedManifest.slice(edit.end);
        }
        await AzExtFsExtra.writeFile(manifestPath, updatedManifest);
    }
    return { issues, bundledFiles };
}

function isContained(root: string, file: string): boolean {
    const relative = path.relative(root, file);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** True when `file` is a regular file (or directory) under `root`, reached without symlinks or `.git`. */
async function isAvailableFile(root: string, file: string, directory: boolean = false): Promise<boolean> {
    if (!isContained(root, file)) {
        return false;
    }
    const relative = path.relative(root, file);
    const segments = relative ? relative.split(path.sep) : [];
    if (segments.some(segment => segment.toLowerCase() === '.git')) {
        return false;
    }
    if (!segments.length) {
        return directory;
    }
    for (let i = 0; i < segments.length; i++) {
        const entry = path.join(root, ...segments.slice(0, i + 1));
        if (!await AzExtFsExtra.pathExists(entry)) {
            return false;
        }
        const stat = await fs.promises.lstat(entry);
        const last = i === segments.length - 1;
        if (last && !directory ? !stat.isFile() : !stat.isDirectory()) {
            return false;
        }
    }
    return true;
}

function toPosix(value: string): string {
    return value.split(path.sep).join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidHooks(): Error {
    return new Error(localize('connectorSampleHooksInvalid',
        'The connector sample has invalid deployment hooks in azure.yaml. Fix the sample manifest before retrying.'));
}

function normalizePath(value: string): string {
    return value.replace(/[\\/]/g, path.sep);
}

function replaceHookReference(content: string, reference: string, replacement: string): string {
    const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const token = new RegExp(`(^|["'\\s;&|()<>])${escaped}(?=$|["'\\s;&|()<>])`, 'g');
    return content.replace(token, (_match, prefix: string) => prefix + replacement);
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
