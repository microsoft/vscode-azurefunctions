/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import * as os from 'os';
import * as path from 'path';
import { Uri, workspace, type WorkspaceFolder } from 'vscode';
import { connectorTriggerProjectsSetting, settingsFileName, vscodeFolderName } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { isPathEqual } from '../utils/fs';
import { parseJson } from '../utils/parseJson';
import { isRecord } from './connectorTriggerUtils';

export const connectorTriggerProjectMetadataVersion = 1 as const;

export interface ConnectorTriggerProjectMetadata {
    version: typeof connectorTriggerProjectMetadataVersion;
    connectorId: string;
    operationId: string;
}

export type ConnectorTriggerProjectMetadataErrorCode =
    'InvalidJson' |
    'InvalidProjectPath' |
    'InvalidSchema' |
    'MetadataNotSaved' |
    'ReadFailed' |
    'UnsupportedVersion';

export class ConnectorTriggerProjectMetadataError extends Error {
    public constructor(
        public readonly code: ConnectorTriggerProjectMetadataErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'ConnectorTriggerProjectMetadataError';
    }
}

const projectMetadataFileName = 'azureFunctions.connectorTrigger.json';

export async function readConnectorTriggerProjectMetadata(
    projectPath: string,
): Promise<ConnectorTriggerProjectMetadata | undefined> {
    const folder = getProjectWorkspaceFolder(projectPath);
    const metadataPath = getProjectMetadataPath(projectPath);
    throwIfMetadataDocumentIsDirty(metadataPath);
    const fileMetadata = await readMetadataFile(metadataPath);
    if (fileMetadata) {
        return fileMetadata;
    }

    if (folder && !isPathEqual(folder.uri.fsPath, projectPath)) {
        const metadata = await readProjectSetting(folder.uri.fsPath, projectPath);
        if (metadata) {
            return metadata;
        }
    }
    return await readProjectSetting(projectPath, projectPath);
}

function getProjectMetadataPath(projectPath: string): string {
    return path.join(projectPath, vscodeFolderName, projectMetadataFileName);
}

function throwIfMetadataDocumentIsDirty(metadataPath: string): void {
    if (workspace.textDocuments.some(document =>
        isPathEqual(document.uri.fsPath, metadataPath) && document.isDirty)) {
        throw createMetadataError('MetadataNotSaved');
    }
}

async function readMetadataFile(metadataPath: string): Promise<ConnectorTriggerProjectMetadata | undefined> {
    let contents: string;
    try {
        contents = await fs.promises.readFile(metadataPath, 'utf8');
    } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
            return undefined;
        }
        throw createMetadataError('ReadFailed');
    }

    if (!contents.trim()) {
        throw createMetadataError('InvalidJson');
    }

    let value: unknown;
    try {
        value = parseJson<object>(contents);
    } catch {
        throw createMetadataError('InvalidJson');
    }
    return validateMetadata(value);
}

function getProjectWorkspaceFolder(projectPath: string): WorkspaceFolder | undefined {
    if (!isNonEmptyString(projectPath) || !path.isAbsolute(projectPath)) {
        throw createMetadataError('InvalidProjectPath');
    }
    return workspace.getWorkspaceFolder(Uri.file(projectPath));
}

async function readProjectSetting(
    folderPath: string,
    projectPath: string,
): Promise<ConnectorTriggerProjectMetadata | undefined> {
    const { contents } = await readSettingsFile(folderPath);
    const settingKey = `${ext.prefix}.${connectorTriggerProjectsSetting}`;
    const errors: jsonc.ParseError[] = [];
    const settings: unknown = jsonc.parse(contents.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true });
    // Unrelated editor settings, even incomplete ones, must not block non-connector projects.
    if (!isRecord(settings) || !Object.prototype.hasOwnProperty.call(settings, settingKey)) {
        return undefined;
    }
    if (errors.length > 0) {
        throw createMetadataError('InvalidJson');
    }
    const projects = readProjectsSetting(settings[settingKey]);
    const projectKey = findProjectKey(projects, folderPath, projectPath);
    return projectKey === undefined ? undefined : validateMetadata(projects[projectKey]);
}

function readProjectsSetting(value: unknown): Record<string, unknown> {
    if (value === undefined) {
        return {};
    }
    if (!isRecord(value)) {
        throw createMetadataError('InvalidSchema');
    }
    return value;
}

function findProjectKey(
    projects: Record<string, unknown>,
    folderPath: string,
    projectPath: string,
): string | undefined {
    const keys = Object.keys(projects).filter(key =>
        isPathEqual(path.resolve(folderPath, key), projectPath));
    if (keys.length > 1) {
        throw createMetadataError('InvalidSchema');
    }
    return keys[0];
}

async function readSettingsFile(folderPath: string): Promise<{
    settingsPath: string;
    contents: string;
}> {
    const settingsPath = path.join(folderPath, '.vscode', settingsFileName);
    let contents: string;
    try {
        contents = await AzExtFsExtra.pathExists(settingsPath) ?
            (await AzExtFsExtra.readFile(settingsPath)).toString() :
            `{}${os.EOL}`;
    } catch {
        throw createMetadataError('ReadFailed');
    }

    return { settingsPath, contents };
}

function validateMetadata(value: unknown): ConnectorTriggerProjectMetadata {
    if (!isRecord(value)) {
        throw createMetadataError('InvalidSchema');
    }

    if (value.version !== connectorTriggerProjectMetadataVersion) {
        if (Object.prototype.hasOwnProperty.call(value, 'version')) {
            throw createMetadataError('UnsupportedVersion');
        }
        throw createMetadataError('InvalidSchema');
    }

    if (!hasExactKeys(
        value,
        ['version', 'connectorId', 'operationId'],
    )) {
        throw createMetadataError('InvalidSchema');
    }

    const connectorId = readNonEmptyString(value.connectorId);
    const operationId = readNonEmptyString(value.operationId);
    if (!connectorId || !operationId) {
        throw createMetadataError('InvalidSchema');
    }

    return {
        version: connectorTriggerProjectMetadataVersion,
        connectorId,
        operationId,
    };
}

function createMetadataError(
    code: ConnectorTriggerProjectMetadataErrorCode,
): ConnectorTriggerProjectMetadataError {
    switch (code) {
        case 'InvalidJson':
            return new ConnectorTriggerProjectMetadataError(
                code,
                localize(
                    'connectorTriggerProjectMetadataInvalidJson',
                    'The local Connector Trigger project setup contains invalid JSON.',
                ),
            );
        case 'InvalidProjectPath':
            return new ConnectorTriggerProjectMetadataError(
                code,
                localize(
                    'connectorTriggerProjectMetadataInvalidProjectPath',
                    'A project folder is required for the local Connector Trigger project setup.',
                ),
            );
        case 'InvalidSchema':
            return new ConnectorTriggerProjectMetadataError(
                code,
                localize(
                    'connectorTriggerProjectMetadataInvalidSchema',
                    'The local Connector Trigger project setup is invalid.',
                ),
            );
        case 'MetadataNotSaved':
            return new ConnectorTriggerProjectMetadataError(
                code,
                localize(
                    'connectorTriggerProjectMetadataNotSaved',
                    'Save the Connector Trigger project metadata file and retry.',
                ),
            );
        case 'ReadFailed':
            return new ConnectorTriggerProjectMetadataError(
                code,
                localize(
                    'connectorTriggerProjectMetadataReadFailed',
                    'Unable to read the local Connector Trigger project setup.',
                ),
            );
        case 'UnsupportedVersion':
            return new ConnectorTriggerProjectMetadataError(
                code,
                localize(
                    'connectorTriggerProjectMetadataUnsupportedVersion',
                    'The local Connector Trigger project setup uses an unsupported version.',
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

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function readNonEmptyString(value: unknown): string | undefined {
    return isNonEmptyString(value) && value === value.trim() ? value : undefined;
}
