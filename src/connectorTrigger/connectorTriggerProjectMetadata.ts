/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, parseError } from '@microsoft/vscode-azext-utils';
import { randomUUID } from 'crypto';
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
    'MetadataChanged' |
    'MetadataNotSaved' |
    'ReadFailed' |
    'SettingsNotSaved' |
    'UnsupportedVersion' |
    'WriteFailed';

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
const metadataWrites = new Map<string, Promise<void>>();

interface MetadataFile {
    contents: string;
    metadata: ConnectorTriggerProjectMetadata;
}

export async function writeConnectorTriggerProjectMetadata(
    projectPath: string,
    metadata: ConnectorTriggerProjectMetadata,
): Promise<void> {
    const validatedHandoff = validateMetadata(metadata);
    getProjectWorkspaceFolder(projectPath);
    const metadataPath = getProjectMetadataPath(projectPath);
    await withMetadataWriteLock(metadataPath, async () => {
        await writeMetadataFile(metadataPath, validatedHandoff);
    });
}

export async function readConnectorTriggerProjectMetadata(
    projectPath: string,
): Promise<ConnectorTriggerProjectMetadata | undefined> {
    const folder = getProjectWorkspaceFolder(projectPath);
    const metadataPath = getProjectMetadataPath(projectPath);
    throwIfMetadataDocumentIsDirty(metadataPath);
    const file = await readMetadataFile(metadataPath);
    if (file) {
        return file.metadata;
    }

    const metadata = await readProjectSetting(projectPath, projectPath);
    if (metadata) {
        return metadata;
    }

    if (folder && !isPathEqual(folder.uri.fsPath, projectPath)) {
        return await readProjectSetting(folder.uri.fsPath, projectPath);
    }
    return undefined;
}

function getProjectMetadataPath(projectPath: string): string {
    return path.join(projectPath, vscodeFolderName, projectMetadataFileName);
}

async function withMetadataWriteLock(metadataPath: string, write: () => Promise<void>): Promise<void> {
    const normalizedPath = path.resolve(metadataPath);
    const key = process.platform === 'win32' || process.platform === 'darwin' ?
        normalizedPath.toLowerCase() : normalizedPath;
    const previous = metadataWrites.get(key);
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    metadataWrites.set(key, current);
    try {
        await previous;
        await write();
    } finally {
        release();
        if (metadataWrites.get(key) === current) {
            metadataWrites.delete(key);
        }
    }
}

async function writeMetadataFile(
    metadataPath: string,
    metadata: ConnectorTriggerProjectMetadata,
): Promise<void> {
    try {
        throwIfMetadataDocumentIsDirty(metadataPath);
        await AzExtFsExtra.ensureDir(path.dirname(metadataPath));
        const existing = await readMetadataFile(metadataPath);
        const contents = updateMetadataContents(existing, metadata);
        if (contents === existing?.contents) {
            return;
        }

        const temporaryPath = `${metadataPath}.${randomUUID()}.tmp`;
        let temporaryCreated = false;
        try {
            const temporaryFile = await fs.promises.open(temporaryPath, 'wx');
            temporaryCreated = true;
            try {
                await temporaryFile.writeFile(contents, 'utf8');
            } finally {
                await temporaryFile.close();
            }

            throwIfMetadataDocumentIsDirty(metadataPath);
            const latest = await readMetadataFile(metadataPath);
            if (latest?.contents !== existing?.contents) {
                throw createMetadataError('MetadataChanged');
            }
            await fs.promises.rename(temporaryPath, metadataPath);
            temporaryCreated = false;
        } finally {
            if (temporaryCreated) {
                await fs.promises.unlink(temporaryPath);
            }
        }
    } catch (error) {
        if (error instanceof ConnectorTriggerProjectMetadataError || parseError(error).isUserCancelledError) {
            throw error;
        }
        throw createMetadataError('WriteFailed');
    }
}

function throwIfMetadataDocumentIsDirty(metadataPath: string): void {
    if (workspace.textDocuments.some(document =>
        isPathEqual(document.uri.fsPath, metadataPath) && document.isDirty)) {
        throw createMetadataError('MetadataNotSaved');
    }
}

async function readMetadataFile(metadataPath: string): Promise<MetadataFile | undefined> {
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
    return { contents, metadata: validateMetadata(value) };
}

function updateMetadataContents(
    existing: MetadataFile | undefined,
    metadata: ConnectorTriggerProjectMetadata,
): string {
    if (!existing) {
        return `${JSON.stringify(metadata, undefined, 4)}${os.EOL}`;
    }

    const bom = existing.contents.startsWith('\uFEFF') ? '\uFEFF' : '';
    let contents = existing.contents.slice(bom.length);
    for (const key of ['connectorId', 'operationId'] as const) {
        if (existing.metadata[key] !== metadata[key]) {
            const edits = jsonc.modify(contents, [key], metadata[key], {
                formattingOptions: {
                    insertSpaces: true,
                    tabSize: 4,
                    eol: contents.includes('\r\n') ? '\r\n' : '\n',
                },
            });
            contents = jsonc.applyEdits(contents, edits);
        }
    }
    return bom + contents;
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
    if (!isJsonObject(settings) || !Object.prototype.hasOwnProperty.call(settings, settingKey)) {
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
    if (!isJsonObject(value)) {
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
    if (!isJsonObject(value)) {
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
        case 'MetadataChanged':
            return new ConnectorTriggerProjectMetadataError(
                code,
                localize(
                    'connectorTriggerProjectMetadataChanged',
                    'The Connector Trigger project metadata changed during setup. Resolve the changes and retry.',
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
        case 'SettingsNotSaved':
            return new ConnectorTriggerProjectMetadataError(
                code,
                localize(
                    'connectorTriggerProjectSettingsNotSaved',
                    'Save the folder\'s VS Code settings and retry creating the Connector Trigger.',
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
        case 'WriteFailed':
            return new ConnectorTriggerProjectMetadataError(
                code,
                localize(
                    'connectorTriggerProjectMetadataWriteFailed',
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

function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function readNonEmptyString(value: unknown): string | undefined {
    return isNonEmptyString(value) && value === value.trim() ? value : undefined;
}
