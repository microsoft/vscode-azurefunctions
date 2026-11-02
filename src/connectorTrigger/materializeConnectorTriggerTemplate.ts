/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { localize } from '../localize';
import {
    type IConnectorTriggerTemplate,
    type IConnectorTriggerTemplateOperation,
} from '../templates/projectTemplates/IProjectTemplate';

export async function materializeConnectorTriggerTemplate(
    projectPath: string,
    template: IConnectorTriggerTemplate,
    operationId: string,
): Promise<IConnectorTriggerTemplateOperation> {
    const operations = validateConnectorTriggerTemplate(projectPath, template);
    const selected = operations.find(operation =>
        operation.operationId === operationId);
    if (!selected) {
        throw new Error(localize(
            'connectorTriggerOperationTemplateUnavailable',
            'The selected connector event is not available in this project template.',
        ));
    }

    const selectedPaths = new Set(selected.ownedPaths.map(normalizeOwnedPath));
    for (const operation of operations) {
        if (operation === selected) {
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

    for (const ownedPath of selected.ownedPaths) {
        if (!await AzExtFsExtra.pathExists(resolveOwnedPath(projectPath, ownedPath))) {
            throw new Error(localize(
                'connectorTriggerOwnedArtifactMissing',
                'The selected connector event template is missing a required artifact.',
            ));
        }
    }
    return selected;
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
        if (!isNonEmptyString(operation.operationId) ||
            !isNonEmptyString(operation.functionName) ||
            !Array.isArray(operation.ownedPaths) ||
            operation.ownedPaths.length === 0 ||
            operationIds.has(operation.operationId) ||
            functionNames.has(operation.functionName)) {
            throw createInvalidOwnershipError();
        }
        operationIds.add(operation.operationId);
        functionNames.add(operation.functionName);

        const operationPaths = new Set<string>();
        for (const ownedPath of operation.ownedPaths) {
            if (!isNonEmptyString(ownedPath)) {
                throw createInvalidOwnershipError();
            }
            resolveOwnedPath(projectPath, ownedPath);
            const normalized = normalizeOwnedPath(ownedPath);
            if (operationPaths.has(normalized) || ownedPaths.has(normalized)) {
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
        ownedPath.includes('*') ||
        ownedPath.includes('?') ||
        ownedPath.includes('\\')) {
        throw createInvalidOwnershipError();
    }

    const segments = ownedPath.split('/');
    if (segments.some(segment =>
        !segment || segment === '.' || segment === '..')) {
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

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function createInvalidOwnershipError(): Error {
    return new Error(localize(
        'connectorTriggerOwnershipInvalid',
        'The connector project template contains invalid operation ownership metadata.',
    ));
}
