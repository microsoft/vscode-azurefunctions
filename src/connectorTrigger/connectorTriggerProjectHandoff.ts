/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as os from 'os';
import * as path from 'path';
import { gitignoreFileName } from '../constants';
import { localize } from '../localize';

export const connectorTriggerProjectHandoffVersion = 1 as const;
const connectorTriggerProjectHandoffPathSegments = [
    '.azurefunctions',
    'connector-trigger-project-handoff.json',
] as const;
export const connectorTriggerProjectHandoffRelativePath =
    connectorTriggerProjectHandoffPathSegments.join('/');
const connectorTriggerProjectHandoffGitIgnoreEntry =
    `/${connectorTriggerProjectHandoffRelativePath}`;

export type ConnectorTriggerCatalogSource = 'bundled' | 'live' | 'remote';

export interface ConnectorTriggerProjectHandoff {
    version: typeof connectorTriggerProjectHandoffVersion;
    subscription: {
        id: string;
        tenantId: string;
        environment: {
            name: string;
            resourceManagerEndpointUrl: string;
        };
    };
    region: string;
    connectorId: string;
    operationId: string;
    catalog?: {
        source: ConnectorTriggerCatalogSource;
    };
}

export type ConnectorTriggerProjectHandoffErrorCode =
    'ClearFailed' |
    'InvalidJson' |
    'InvalidProjectPath' |
    'InvalidSchema' |
    'ReadFailed' |
    'SourceControlExclusionFailed' |
    'UnsupportedVersion' |
    'WriteFailed';

export class ConnectorTriggerProjectHandoffError extends Error {
    public constructor(
        public readonly code: ConnectorTriggerProjectHandoffErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'ConnectorTriggerProjectHandoffError';
    }
}

export function getConnectorTriggerProjectHandoffPath(projectPath: string): string {
    if (!isNonEmptyString(projectPath)) {
        throw createHandoffError('InvalidProjectPath');
    }

    return path.join(projectPath, ...connectorTriggerProjectHandoffPathSegments);
}

export async function writeConnectorTriggerProjectHandoff(
    projectPath: string,
    handoff: ConnectorTriggerProjectHandoff,
): Promise<void> {
    const validatedHandoff = validateHandoff(handoff);
    const handoffPath = getConnectorTriggerProjectHandoffPath(projectPath);

    await ensureHandoffIsIgnored(projectPath);
    try {
        await AzExtFsExtra.ensureDir(path.dirname(handoffPath));
        await AzExtFsExtra.writeFile(
            handoffPath,
            `${JSON.stringify(validatedHandoff, null, 2)}${os.EOL}`,
        );
    } catch {
        throw createHandoffError('WriteFailed');
    }
}

export async function readConnectorTriggerProjectHandoff(
    projectPath: string,
): Promise<ConnectorTriggerProjectHandoff | undefined> {
    const handoffPath = getConnectorTriggerProjectHandoffPath(projectPath);
    try {
        if (!await AzExtFsExtra.pathExists(handoffPath)) {
            return undefined;
        }
    } catch {
        throw createHandoffError('ReadFailed');
    }

    let contents: string;
    try {
        contents = (await AzExtFsExtra.readFile(handoffPath)).toString();
    } catch {
        throw createHandoffError('ReadFailed');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(contents);
    } catch {
        throw createHandoffError('InvalidJson');
    }

    return validateHandoff(parsed);
}

export async function clearConnectorTriggerProjectHandoff(
    projectPath: string,
): Promise<void> {
    const handoffPath = getConnectorTriggerProjectHandoffPath(projectPath);
    try {
        if (await AzExtFsExtra.pathExists(handoffPath)) {
            await AzExtFsExtra.deleteResource(handoffPath, { recursive: false });
        }
    } catch {
        throw createHandoffError('ClearFailed');
    }
}

async function ensureHandoffIsIgnored(projectPath: string): Promise<void> {
    const gitignorePath = path.join(projectPath, gitignoreFileName);
    let contents = '';
    try {
        if (await AzExtFsExtra.pathExists(gitignorePath)) {
            contents = (await AzExtFsExtra.readFile(gitignorePath)).toString();
        }

        if (hasHandoffIgnoreRule(contents)) {
            return;
        }

        const lineEnding = contents.includes('\r\n') ? '\r\n' : os.EOL;
        const separator = contents.length > 0 &&
            !contents.endsWith('\n') &&
            !contents.endsWith('\r') ?
            lineEnding :
            '';
        await AzExtFsExtra.writeFile(
            gitignorePath,
            `${contents}${separator}${connectorTriggerProjectHandoffGitIgnoreEntry}${lineEnding}`,
        );
    } catch {
        throw createHandoffError('SourceControlExclusionFailed');
    }
}

function hasHandoffIgnoreRule(contents: string): boolean {
    const rules = new Set([
        '.azurefunctions',
        '.azurefunctions/',
        '.azurefunctions/connector-trigger-project-handoff.json',
        '/.azurefunctions',
        '/.azurefunctions/',
        connectorTriggerProjectHandoffGitIgnoreEntry,
    ]);
    return contents
        .split(/\r?\n/)
        .some(line => rules.has(line.trim()));
}

function validateHandoff(value: unknown): ConnectorTriggerProjectHandoff {
    if (!isJsonObject(value)) {
        throw createHandoffError('InvalidSchema');
    }

    if (value.version !== connectorTriggerProjectHandoffVersion) {
        if (Object.prototype.hasOwnProperty.call(value, 'version')) {
            throw createHandoffError('UnsupportedVersion');
        }
        throw createHandoffError('InvalidSchema');
    }

    if (!hasExactKeys(
        value,
        ['version', 'subscription', 'region', 'connectorId', 'operationId'],
        ['catalog'],
    )) {
        throw createHandoffError('InvalidSchema');
    }

    const subscription = value.subscription;
    if (!isJsonObject(subscription) ||
        !hasExactKeys(subscription, ['id', 'tenantId', 'environment'])) {
        throw createHandoffError('InvalidSchema');
    }

    const environment = subscription.environment;
    if (!isJsonObject(environment) ||
        !hasExactKeys(environment, ['name', 'resourceManagerEndpointUrl'])) {
        throw createHandoffError('InvalidSchema');
    }

    const subscriptionId = readNonEmptyString(subscription.id);
    const tenantId = readNonEmptyString(subscription.tenantId);
    const environmentName = readNonEmptyString(environment.name);
    const resourceManagerEndpointUrl =
        readNonEmptyString(environment.resourceManagerEndpointUrl);
    const region = readNonEmptyString(value.region);
    const connectorId = readNonEmptyString(value.connectorId);
    const operationId = readNonEmptyString(value.operationId);
    if (!subscriptionId ||
        !tenantId ||
        !environmentName ||
        !resourceManagerEndpointUrl ||
        !region ||
        !connectorId ||
        !operationId) {
        throw createHandoffError('InvalidSchema');
    }

    let catalog: ConnectorTriggerProjectHandoff['catalog'];
    if (value.catalog !== undefined) {
        if (!isJsonObject(value.catalog) ||
            !hasExactKeys(value.catalog, ['source']) ||
            !isCatalogSource(value.catalog.source)) {
            throw createHandoffError('InvalidSchema');
        }
        catalog = { source: value.catalog.source };
    }

    return {
        version: connectorTriggerProjectHandoffVersion,
        subscription: {
            id: subscriptionId,
            tenantId,
            environment: {
                name: environmentName,
                resourceManagerEndpointUrl,
            },
        },
        region,
        connectorId,
        operationId,
        ...(catalog ? { catalog } : {}),
    };
}

function createHandoffError(
    code: ConnectorTriggerProjectHandoffErrorCode,
): ConnectorTriggerProjectHandoffError {
    switch (code) {
        case 'ClearFailed':
            return new ConnectorTriggerProjectHandoffError(
                code,
                localize(
                    'connectorTriggerProjectHandoffClearFailed',
                    'Unable to clear the local Connector Trigger project setup.',
                ),
            );
        case 'InvalidJson':
            return new ConnectorTriggerProjectHandoffError(
                code,
                localize(
                    'connectorTriggerProjectHandoffInvalidJson',
                    'The local Connector Trigger project setup contains invalid JSON.',
                ),
            );
        case 'InvalidProjectPath':
            return new ConnectorTriggerProjectHandoffError(
                code,
                localize(
                    'connectorTriggerProjectHandoffInvalidProjectPath',
                    'A project folder is required for the local Connector Trigger project setup.',
                ),
            );
        case 'InvalidSchema':
            return new ConnectorTriggerProjectHandoffError(
                code,
                localize(
                    'connectorTriggerProjectHandoffInvalidSchema',
                    'The local Connector Trigger project setup is invalid.',
                ),
            );
        case 'ReadFailed':
            return new ConnectorTriggerProjectHandoffError(
                code,
                localize(
                    'connectorTriggerProjectHandoffReadFailed',
                    'Unable to read the local Connector Trigger project setup.',
                ),
            );
        case 'SourceControlExclusionFailed':
            return new ConnectorTriggerProjectHandoffError(
                code,
                localize(
                    'connectorTriggerProjectHandoffIgnoreFailed',
                    'Unable to exclude the local Connector Trigger project setup from source control.',
                ),
            );
        case 'UnsupportedVersion':
            return new ConnectorTriggerProjectHandoffError(
                code,
                localize(
                    'connectorTriggerProjectHandoffUnsupportedVersion',
                    'The local Connector Trigger project setup uses an unsupported version.',
                ),
            );
        case 'WriteFailed':
            return new ConnectorTriggerProjectHandoffError(
                code,
                localize(
                    'connectorTriggerProjectHandoffWriteFailed',
                    'Unable to write the local Connector Trigger project setup.',
                ),
            );
        default:
            return code satisfies never;
    }
}

function hasExactKeys(
    value: Record<string, unknown>,
    requiredKeys: string[],
    optionalKeys: string[] = [],
): boolean {
    const keys = Object.keys(value);
    const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
    return requiredKeys.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
        keys.every(key => allowedKeys.has(key));
}

function isCatalogSource(value: unknown): value is ConnectorTriggerCatalogSource {
    return value === 'bundled' || value === 'live' || value === 'remote';
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function readNonEmptyString(value: unknown): string | undefined {
    return isNonEmptyString(value) && value === value.trim() ? value : undefined;
}
