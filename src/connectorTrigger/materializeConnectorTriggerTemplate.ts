/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType, Uri, workspace } from 'vscode';
import { localize } from '../localize';
import {
    findConnectorTriggerRegistrations,
    findPollingConnectorBindings,
    getPollingConnectorBindings,
} from './connectorTriggerBindings';
import { getConnectorTriggerEventIdentity } from './connectorTriggerEventIdentity';
import {
    type IConnectorTriggerTemplate,
    type IConnectorTriggerTemplateOperation,
} from '../templates/projectTemplates/IProjectTemplate';

export async function materializeConnectorTriggerTemplateOperations(
    projectPath: string,
    template: IConnectorTriggerTemplate,
    operationIds: readonly string[],
): Promise<IConnectorTriggerTemplateOperation[]> {
    const operations = validateConnectorTriggerTemplate(projectPath, template);
    const selected = operations.filter(operation => operationIds.includes(operation.operationId));
    if (operationIds.length === 0 || selected.length !== operationIds.length) {
        throw new Error(localize(
            'connectorTriggerOperationTemplateUnavailable',
            'The selected connector event is not available in this project template.',
        ));
    }

    for (const operation of selected) {
        for (const ownedPath of operation.ownedPaths) {
            if (!await AzExtFsExtra.pathExists(resolveOwnedPath(projectPath, ownedPath))) {
                throw new Error(localize(
                    'connectorTriggerOwnedArtifactMissing',
                    'The selected connector event template is missing a required artifact.',
                ));
            }
        }
    }

    const selectedPaths = new Set(selected.flatMap(operation => operation.ownedPaths.map(normalizeOwnedPath)));
    for (const operation of operations) {
        if (selected.includes(operation)) {
            continue;
        }
        for (const ownedPath of operation.ownedPaths) {
            const normalized = normalizeOwnedPath(ownedPath);
            if (selectedPaths.has(normalized)) {
                throw createInvalidOwnershipError();
            }
            const resolvedPath = resolveOwnedPath(projectPath, ownedPath);
            if (await AzExtFsExtra.pathExists(resolvedPath)) {
                await AzExtFsExtra.deleteResource(resolvedPath, {
                    recursive: true,
                    useTrash: false,
                });
            }
        }
    }

    if (selected.length > 1) {
        await configureMultipleOperations(projectPath, selected);
    }

    const registrations = await findConnectorTriggerRegistrations(projectPath);
    const bindings = await findPollingConnectorBindings(projectPath);
    const functionNames = selected.map(operation => operation.functionName);
    if (registrations.length !== selected.length ||
        bindings.length !== selected.length ||
        functionNames.some(name => registrations.filter(registration => registration === name).length !== 1 ||
            bindings.filter(binding => binding.functionName === name).length !== 1)) {
        throw new Error(localize(
            'connectorTriggerMaterializationInvalid',
            'The selected connector event template did not produce exactly one matching Poll trigger for each selected event.',
        ));
    }
    return selected;
}

async function configureMultipleOperations(projectPath: string, operations: IConnectorTriggerTemplateOperation[]): Promise<void> {
    const bindings = await findPollingConnectorBindings(projectPath);
    const usedSettings = new Set(bindings.map(binding => binding.triggerConfigSettingName.toLowerCase()));
    const replacements = new Map<string, { before: string; after: string }>();
    for (const binding of bindings) {
        if (!binding.functionName || bindings.filter(candidate =>
            candidate.triggerConfigSettingName.toLowerCase() === binding.triggerConfigSettingName.toLowerCase()).length < 2) {
            continue;
        }
        const baseName = getConnectorTriggerEventIdentity('', binding.functionName).triggerConfigSettingName;
        let name = baseName;
        for (let instance = 2; usedSettings.has(name.toLowerCase()); instance++) {
            name = `${baseName}${instance}`;
        }
        usedSettings.add(name.toLowerCase());
        replacements.set(binding.functionName, { before: binding.triggerConfigSettingName, after: name });
    }
    const visit = async (filePath: string): Promise<void> => {
        const stat = await workspace.fs.stat(Uri.file(filePath));
        if (stat.type & FileType.SymbolicLink) {
            throw createInvalidOwnershipError();
        }
        if (stat.type === FileType.File && /\.(?:cs|py|js|ts)$/i.test(filePath)) {
            let content = await AzExtFsExtra.readFile(filePath);
            for (const binding of getPollingConnectorBindings(content)) {
                const replacement = binding.functionName ? replacements.get(binding.functionName) : undefined;
                if (replacement) {
                    content = content.split(`%${replacement.before}%`).join(`%${replacement.after}%`);
                }
            }
            await AzExtFsExtra.writeFile(filePath, content);
        } else {
            if (stat.type === FileType.Directory) {
                for (const child of await AzExtFsExtra.readDirectory(filePath)) {
                    await visit(path.join(filePath, child.name));
                }
            }
        }
    };
    for (const operation of operations) {
        for (const ownedPath of operation.ownedPaths) {
            await visit(resolveOwnedPath(projectPath, ownedPath));
        }
    }
    const typeScriptOptionsPath = path.join(projectPath, 'src', 'pollConnectorTriggerOptions.ts');
    if (replacements.size > 0 && await AzExtFsExtra.pathExists(typeScriptOptionsPath)) {
        const sharedSettings = new Set([...replacements.values()].map(replacement => `%${replacement.before}%`));
        const options = await AzExtFsExtra.readFile(typeScriptOptionsPath);
        await AzExtFsExtra.writeFile(typeScriptOptionsPath, options.replace(
            /^(\s*triggerConfigName\s*:\s*)(['"])(%[^%]+%)\2(?=\s*;)/gm,
            (declaration: string, prefix: string, _quote: string, setting: string) =>
                sharedSettings.has(setting) ? `${prefix}\`%\${string}%\`` : declaration,
        ));
    }
    const settingsPath = path.join(projectPath, 'local.settings.json');
    if (replacements.size > 0 && await AzExtFsExtra.pathExists(settingsPath)) {
        const settings = await AzExtFsExtra.readJSON<{ IsEncrypted?: boolean; Values?: Record<string, string> }>(settingsPath);
        if (settings.IsEncrypted) {
            throw createInvalidOwnershipError();
        }
        settings.Values ??= {};
        for (const replacement of replacements.values()) {
            settings.Values[replacement.after] ??= '';
        }
        await AzExtFsExtra.writeJSON(settingsPath, settings);
    }

    const loaderPath = path.join(projectPath, 'shared', 'operation_loader.py');
    const functionAppPath = path.join(projectPath, 'function_app.py');
    if (await AzExtFsExtra.pathExists(loaderPath) && await AzExtFsExtra.pathExists(functionAppPath)) {
        const functionApp = await AzExtFsExtra.readFile(functionAppPath);
        if (functionApp.includes('load_selected_blueprint(')) {
            const loader = await AzExtFsExtra.readFile(loaderPath);
            const registration = /app\.register_functions\(load_selected_blueprint\(Path\(__file__\)\.parent\)\)/;
            if (!loader.includes('def _load_module(') ||
                !functionApp.includes('import load_selected_blueprint') || !registration.test(functionApp)) {
                throw createInvalidOwnershipError();
            }
            await AzExtFsExtra.writeFile(loaderPath, `${loader.trimEnd()}


def load_selected_blueprints(app_root: Path) -> list[Any]:
    descriptor_paths = sorted(app_root.glob("operations/**/trigger-config.json"))
    if not descriptor_paths:
        raise RuntimeError("No retained connector operation descriptors were found.")
    blueprints = []
    for descriptor in descriptor_paths:
        module = _load_module(descriptor.parent / "function.py")
        blueprint = getattr(module, "bp", None)
        if blueprint is None:
            raise RuntimeError("Each retained operation must export a 'bp' blueprint.")
        blueprints.append(blueprint)
    return blueprints
`);
            await AzExtFsExtra.writeFile(functionAppPath, functionApp
                .replace('import load_selected_blueprint', 'import load_selected_blueprints')
                .replace(registration,
                    'for blueprint in load_selected_blueprints(Path(__file__).parent):\n    app.register_functions(blueprint)'));
        }
    }
}

function validateConnectorTriggerTemplate(
    projectPath: string,
    template: IConnectorTriggerTemplate,
): IConnectorTriggerTemplateOperation[] {
    if (!Array.isArray(template.operations) || template.operations.length === 0) {
        throw createInvalidOwnershipError();
    }

    const operationIds = new Set<string>();
    const functionNames = new Set<string>();
    const ownedPaths = new Set<string>();
    for (const operation of template.operations) {
        const operationId = normalizeIdentifier(operation.operationId);
        const functionName = normalizeIdentifier(operation.functionName);
        if (!isNonEmptyString(operation.operationId) ||
            !isNonEmptyString(operation.functionName) ||
            !Array.isArray(operation.ownedPaths) ||
            operation.ownedPaths.length === 0 ||
            operationIds.has(operationId) ||
            functionNames.has(functionName)) {
            throw createInvalidOwnershipError();
        }
        operationIds.add(operationId);
        functionNames.add(functionName);

        const operationPaths = new Set<string>();
        for (const ownedPath of operation.ownedPaths) {
            if (!isNonEmptyString(ownedPath)) {
                throw createInvalidOwnershipError();
            }
            resolveOwnedPath(projectPath, ownedPath);
            const normalized = normalizeOwnedPath(ownedPath);
            if (operationPaths.has(normalized) ||
                [...ownedPaths].some(existingPath =>
                    pathsOverlap(existingPath, normalized))) {
                throw createInvalidOwnershipError();
            }
            operationPaths.add(normalized);
            ownedPaths.add(normalized);
        }
    }
    return template.operations;
}

function resolveOwnedPath(projectPath: string, ownedPath: string): string {
    if (path.isAbsolute(ownedPath) ||
        /[*?[\]{}]/.test(ownedPath) ||
        ownedPath.includes('\\')) {
        throw createInvalidOwnershipError();
    }

    const segments = ownedPath.split('/');
    if (segments.some(segment =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.trim() !== segment ||
        segment.endsWith('.') ||
        segment.includes(':') ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) {
        throw createInvalidOwnershipError();
    }
    const projectRoot = path.resolve(projectPath);
    const resolved = path.resolve(projectRoot, ...segments);
    const relative = path.relative(projectRoot, resolved);
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw createInvalidOwnershipError();
    }
    return resolved;
}

function normalizeOwnedPath(ownedPath: string): string {
    return ownedPath.toLowerCase();
}

function normalizeIdentifier(value: unknown): string {
    return typeof value === 'string' ? value.toLowerCase() : '';
}

function pathsOverlap(left: string, right: string): boolean {
    return left === right ||
        left.startsWith(`${right}/`) ||
        right.startsWith(`${left}/`);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function createInvalidOwnershipError(): Error {
    return new Error(localize(
        'connectorTriggerOwnershipInvalid',
        'The connector project template contains invalid operation ownership metadata.',
    ));
}
