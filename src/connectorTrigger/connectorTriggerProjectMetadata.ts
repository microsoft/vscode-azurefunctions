/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, parseError } from '@microsoft/vscode-azext-utils';
import * as jsonc from 'jsonc-parser';
import * as os from 'os';
import * as path from 'path';
import { Uri, workspace, type WorkspaceFolder } from 'vscode';
import { connectorTriggerProjectsSetting, settingsFileName } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { isPathEqual } from '../utils/fs';
import { parseJson } from '../utils/parseJson';
import { updateWorkspaceSetting } from '../vsCodeConfig/settings';

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

export async function writeConnectorTriggerProjectMetadata(
    projectPath: string,
    metadata: ConnectorTriggerProjectMetadata,
): Promise<void> {
    const validatedHandoff = validateMetadata(metadata);
    const folder = getProjectWorkspaceFolder(projectPath);
    const folderPath = folder?.uri.fsPath ?? projectPath;
    const { settingsPath, contents, settings } = await readProjectSettings(folderPath);
    if (workspace.textDocuments.some(document =>
        isPathEqual(document.uri.fsPath, settingsPath) && document.isDirty)) {
        throw createMetadataError('SettingsNotSaved');
    }

    const settingKey = `${ext.prefix}.${connectorTriggerProjectsSetting}`;
    const projects = readProjectsSetting(settings[settingKey]);
    const projectKey = findProjectKey(projects, folderPath, projectPath) ??
        (path.relative(folderPath, projectPath).split(path.sep).join('/') || '.');
    try {
        if (folder) {
            await updateWorkspaceSetting(connectorTriggerProjectsSetting, {
                ...projects,
                [projectKey]: validatedHandoff,
            }, folder);
        } else {
            const bom = contents.startsWith('\uFEFF') ? '\uFEFF' : '';
            const json = contents.slice(bom.length);
            const edits = jsonc.modify(json, [settingKey, projectKey], validatedHandoff, {
                formattingOptions: {
                    insertSpaces: true,
                    tabSize: 4,
                    eol: contents.includes('\r\n') ? '\r\n' : os.EOL,
                },
            });
            await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
            await AzExtFsExtra.writeFile(settingsPath, bom + jsonc.applyEdits(json, edits));
        }
    } catch (error) {
        if (parseError(error).isUserCancelledError) {
            throw error;
        }
        throw createMetadataError('WriteFailed');
    }
}

export async function readConnectorTriggerProjectMetadata(
    projectPath: string,
): Promise<ConnectorTriggerProjectMetadata | undefined> {
    const folder = getProjectWorkspaceFolder(projectPath);
    if (folder) {
        const metadata = await readProjectSetting(folder.uri.fsPath, projectPath);
        if (metadata) {
            return metadata;
        }
    }

    if (!folder || !isPathEqual(folder.uri.fsPath, projectPath)) {
        const metadata = await readProjectSetting(projectPath, projectPath);
        if (metadata) {
            return metadata;
        }
    }

    return undefined;
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

async function readProjectSettings(folderPath: string): Promise<{
    settingsPath: string;
    contents: string;
    settings: Record<string, unknown>;
}> {
    const file = await readSettingsFile(folderPath);
    let settings: unknown;
    try {
        settings = file.contents.trim() ? parseJson<object>(file.contents) : {};
    } catch {
        throw createMetadataError('InvalidJson');
    }
    if (!isJsonObject(settings)) {
        throw createMetadataError('InvalidSchema');
    }
    return { ...file, settings };
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
