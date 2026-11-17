/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as jsonc from 'jsonc-parser';
import * as os from 'os';
import * as path from 'path';
import { workspace } from 'vscode';
import { connectorTriggerEventsSetting, settingsFileName } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { isPathEqual } from '../utils/fs';
import { isRecord } from './connectorTriggerUtils';
import { isConnectorTriggerAuthoringContext, isConnectorTriggerDeliveryMode, type ConnectorTriggerAuthoringContext, type ConnectorTriggerDeliveryMode } from './connectorTriggerSelection';

export interface ConnectorTriggerProjectMetadata {
    connectorId: string;
    operationId: string;
    functionName?: string;
    /** Optional defaults read from the event setting. */
    azureContext?: ConnectorTriggerAuthoringContext;
}

export type ConnectorTriggerProjectMetadataErrorCode =
    'InvalidJson' |
    'InvalidProjectPath' |
    'InvalidSchema' |
    'ReadFailed' |
    'SettingsNotSaved';

export class ConnectorTriggerProjectMetadataError extends Error {
    public constructor(
        public readonly code: ConnectorTriggerProjectMetadataErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'ConnectorTriggerProjectMetadataError';
    }
}

export async function readConnectorTriggerProjectMetadata(
    projectPath: string,
): Promise<ConnectorTriggerProjectMetadata | undefined> {
    validateProjectPath(projectPath);
    return await readProjectEvents(projectPath);
}

/** Reads every authored event, including its delivery mode. */
export async function readConnectorTriggerProjectEvents(
    projectPath: string,
): Promise<(ConnectorTriggerProjectMetadata & { deliveryMode: ConnectorTriggerDeliveryMode })[]> {
    validateProjectPath(projectPath);
    return (await readProjectEventEntries(projectPath) ?? [])
        .map(({ event, deliveryMode }) => ({ ...event, deliveryMode }));
}

/** Poll events only: F5 setup provisions Poll trigger configurations, and webhook events need manual setup. */
export async function readConnectorTriggerPollEvents(
    projectPath: string,
): Promise<ConnectorTriggerProjectMetadata[]> {
    validateProjectPath(projectPath);
    const entries = await readProjectEventEntries(projectPath);
    return entries?.filter(entry => entry.deliveryMode === 'poll').map(entry => entry.event) ?? [];
}

async function readProjectEvents(projectPath: string): Promise<ConnectorTriggerProjectMetadata | undefined> {
    const events = await readProjectEventList(projectPath);
    if (!events?.length) {
        return undefined;
    }
    if (events.length !== 1) {
        throw createMetadataError('InvalidSchema');
    }
    return events[0];
}

async function readProjectEventList(projectPath: string): Promise<ConnectorTriggerProjectMetadata[] | undefined> {
    return (await readProjectEventEntries(projectPath))?.map(entry => entry.event);
}

async function readProjectEventEntries(projectPath: string): Promise<{
    event: ConnectorTriggerProjectMetadata;
    deliveryMode: ConnectorTriggerDeliveryMode;
}[] | undefined> {
    const { contents, settingsPath } = await readSettingsFile(projectPath);
    const key = `${ext.prefix}.${connectorTriggerEventsSetting}`;
    const errors: jsonc.ParseError[] = [];
    const settings: unknown = jsonc.parse(contents.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true });
    if (!isRecord(settings) || !Object.hasOwn(settings, key)) {
        return undefined;
    }
    if (workspace.textDocuments.some(document => document.isDirty &&
        document.uri.scheme === 'file' && isPathEqual(document.uri.fsPath, settingsPath))) {
        throw createMetadataError('SettingsNotSaved');
    }
    if (errors.length > 0) {
        throw createMetadataError('InvalidJson');
    }
    const events = settings[key];
    if (!Array.isArray(events)) {
        throw createMetadataError('InvalidSchema');
    }
    return events.map(event => {
        if (!isRecord(event) || !hasExactKeys(event, ['connectorId', 'operationId', 'deliveryMode'], ['azureContext', 'functionName']) ||
            (event.azureContext !== undefined && !isConnectorTriggerAuthoringContext(event.azureContext)) ||
            !isConnectorTriggerDeliveryMode(event.deliveryMode) ||
            (event.functionName !== undefined && (typeof event.functionName !== 'string' || !/^[A-Za-z][A-Za-z\d_-]*$/.test(event.functionName)))) {
            throw createMetadataError('InvalidSchema');
        }
        const connectorId = readNonEmptyString(event.connectorId);
        const operationId = readNonEmptyString(event.operationId);
        if (!connectorId || !operationId) {
            throw createMetadataError('InvalidSchema');
        }
        return {
            event: {
                connectorId,
                operationId,
                ...(event.azureContext ? { azureContext: event.azureContext } : {}),
                ...(event.functionName ? { functionName: event.functionName } : {}),
            },
            deliveryMode: event.deliveryMode,
        };
    });
}

/**
 * Reads the delivery mode recorded for each event when the project was created. Returns undefined when the project
 * has no event record (for example, projects created manually or cloned directly), so callers can inspect code.
 */
export async function readConnectorTriggerEventDeliveryModes(projectPath: string): Promise<ConnectorTriggerDeliveryMode[] | undefined> {
    return (await readProjectEventEntries(projectPath))?.map(entry => entry.deliveryMode);
}

function validateProjectPath(projectPath: string): void {
    if (!isNonEmptyString(projectPath) || !path.isAbsolute(projectPath)) {
        throw createMetadataError('InvalidProjectPath');
    }
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
