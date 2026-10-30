/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs/promises';
import { gzipSync } from 'zlib';
import * as path from 'path';
import { parseConnectorSwaggerInputs } from '../src/commands/createNewProject/connectorTriggerPicker/connectorTriggerInputs';
import {
    connectorCatalogVersion,
    type ConnectorCatalogDelivery,
    type ConnectorCatalogMetadataState,
    type IConnectorCatalogConnector,
    type IConnectorCatalogInputDefinition,
    type IConnectorCatalogManifest,
    type IConnectorCatalogOperation,
    type IConnectorCatalogSource,
} from '../src/templates/projectTemplates/IConnectorCatalogManifest';

type JsonRecord = Record<string, unknown>;

export const bundledConnectorCatalogIds = [
    'office365',
    'sharepointonline',
    'onedriveforbusiness',
    'teams',
    'planner',
    'salesforce',
    'visualstudioteamservices',
    'dataflows',
] as const;

export interface ConnectorCatalogGenerationInput {
    generatedAt: string;
    source: IConnectorCatalogSource;
    connectorIds: readonly string[];
    managedApis: unknown;
    operationCatalogs: Readonly<Record<string, unknown>>;
    swaggerDocuments: Readonly<Record<string, unknown>>;
}

export interface ConnectorCatalogSize {
    rawBytes: number;
    gzipBytes: number;
}

export function generateConnectorCatalog(
    input: ConnectorCatalogGenerationInput,
): IConnectorCatalogManifest {
    const managedApis = readCollection(input.managedApis, 'managedApis');
    const managedApisById = new Map<string, JsonRecord>();
    for (const value of managedApis) {
        const managedApi = asRecord(value);
        const id = readString(managedApi?.name);
        if (managedApi && id) {
            managedApisById.set(id.toLowerCase(), managedApi);
        }
    }

    const connectors: IConnectorCatalogConnector[] = [];
    const operations: IConnectorCatalogOperation[] = [];
    const seenConnectorIds = new Set<string>();
    for (const requestedId of input.connectorIds) {
        const connectorKey = requestedId.toLowerCase();
        if (seenConnectorIds.has(connectorKey)) {
            throw new Error(`Duplicate connector id "${requestedId}".`);
        }
        seenConnectorIds.add(connectorKey);

        const managedApi = managedApisById.get(connectorKey);
        if (!managedApi) {
            throw new Error(`Managed API metadata was not found for connector "${requestedId}".`);
        }

        const connectorId = readString(managedApi.name) as string;
        const properties = asRecord(managedApi.properties) ?? {};
        const information = asRecord(properties.generalInformation) ?? {};
        const connectorOperations = createOperations(
            connectorId,
            input.operationCatalogs[requestedId] ?? input.operationCatalogs[connectorId],
            input.swaggerDocuments[requestedId] ?? input.swaggerDocuments[connectorId],
        );
        const complete = connectorOperations.length > 0 &&
            connectorOperations.every(operation => operation.inputs !== undefined);
        const metadataState: ConnectorCatalogMetadataState = connectorOperations.length === 0 ?
            'catalogOnly' :
            complete ? 'complete' : 'partial';

        connectors.push(compactObject({
            id: connectorId,
            name: readString(information.displayName) ?? connectorId,
            description: readString(information.description),
            iconUrl: normalizeHttpsUrl(information.iconUrl),
            visibility: readString(properties.visibility),
            metadataState,
        }));
        operations.push(...connectorOperations);
    }

    return {
        version: connectorCatalogVersion,
        generatedAt: input.generatedAt,
        source: input.source,
        connectors,
        operations,
    };
}

export function validateConnectorCatalog(value: unknown): string[] {
    const errors: string[] = [];
    const catalog = requireObject(value, 'connectorCatalog', errors);
    if (!catalog) {
        return errors;
    }

    validateKeys(catalog, 'connectorCatalog', [
        'version', 'generatedAt', 'source', 'connectors', 'operations',
    ], errors);
    if (catalog.version !== connectorCatalogVersion) {
        errors.push(`connectorCatalog.version must be "${connectorCatalogVersion}".`);
    }
    validateDateTime(catalog.generatedAt, 'connectorCatalog.generatedAt', errors);

    const source = requireObject(catalog.source, 'connectorCatalog.source', errors);
    if (source) {
        validateKeys(source, 'connectorCatalog.source', [
            'kind', 'cloud', 'region', 'catalogApiVersion', 'operationsApiVersion', 'swaggerApiVersion',
        ], errors);
        if (source.kind !== 'azure-managed-connectors') {
            errors.push('connectorCatalog.source.kind must be "azure-managed-connectors".');
        }
        for (const field of [
            'cloud', 'region', 'catalogApiVersion', 'operationsApiVersion', 'swaggerApiVersion',
        ]) {
            validateNonEmptyString(source[field], `connectorCatalog.source.${field}`, errors);
        }
    }

    const connectors = requireArray(catalog.connectors, 'connectorCatalog.connectors', errors);
    const operations = requireArray(catalog.operations, 'connectorCatalog.operations', errors);
    if (connectors?.length === 0) {
        errors.push('connectorCatalog.connectors must contain at least one connector.');
    }
    if (operations?.length === 0) {
        errors.push('connectorCatalog.operations must contain at least one operation.');
    }
    const connectorStates = new Map<string, string>();
    if (connectors) {
        connectors.forEach((value, index) => {
            const itemPath = `connectorCatalog.connectors[${index}]`;
            const connector = requireObject(value, itemPath, errors);
            if (!connector) {
                return;
            }

            validateKeys(connector, itemPath, [
                'id', 'name', 'description', 'iconUrl', 'visibility', 'metadataState',
            ], errors);
            const id = validateNonEmptyString(connector.id, `${itemPath}.id`, errors);
            validateNonEmptyString(connector.name, `${itemPath}.name`, errors);
            validateOptionalString(connector.description, `${itemPath}.description`, errors);
            validateOptionalString(connector.visibility, `${itemPath}.visibility`, errors);
            if (connector.iconUrl !== undefined &&
                (typeof connector.iconUrl !== 'string' || !connector.iconUrl.startsWith('https://'))) {
                errors.push(`${itemPath}.iconUrl must be an HTTPS URL.`);
            }
            if (connector.metadataState !== 'catalogOnly' &&
                connector.metadataState !== 'complete' &&
                connector.metadataState !== 'partial') {
                errors.push(`${itemPath}.metadataState is invalid.`);
            }

            if (id) {
                const key = id.toLowerCase();
                if (connectorStates.has(key)) {
                    errors.push(`${itemPath}.id duplicates connector "${id}".`);
                } else {
                    connectorStates.set(key, String(connector.metadataState));
                }
            }
        });
    }

    const operationCounts = new Map<string, number>();
    const incompleteCounts = new Map<string, number>();
    const operationIds = new Set<string>();
    if (operations) {
        operations.forEach((value, index) => {
            const itemPath = `connectorCatalog.operations[${index}]`;
            const operation = requireObject(value, itemPath, errors);
            if (!operation) {
                return;
            }

            validateKeys(operation, itemPath, [
                'id', 'connectorId', 'name', 'description', 'visibility', 'delivery', 'inputs',
            ], errors);
            const id = validateNonEmptyString(operation.id, `${itemPath}.id`, errors);
            const connectorId = validateNonEmptyString(
                operation.connectorId,
                `${itemPath}.connectorId`,
                errors,
            );
            validateNonEmptyString(operation.name, `${itemPath}.name`, errors);
            validateOptionalString(operation.description, `${itemPath}.description`, errors);
            validateOptionalString(operation.visibility, `${itemPath}.visibility`, errors);
            if (operation.delivery !== 'notification' &&
                operation.delivery !== 'polling' &&
                operation.delivery !== 'webhook') {
                errors.push(`${itemPath}.delivery is invalid.`);
            }

            if (connectorId) {
                const connectorKey = connectorId.toLowerCase();
                if (!connectorStates.has(connectorKey)) {
                    errors.push(`${itemPath}.connectorId does not reference a connector.`);
                }
                operationCounts.set(connectorKey, (operationCounts.get(connectorKey) ?? 0) + 1);
                if (!Object.prototype.hasOwnProperty.call(operation, 'inputs')) {
                    incompleteCounts.set(connectorKey, (incompleteCounts.get(connectorKey) ?? 0) + 1);
                }

                if (id) {
                    const operationKey = `${connectorKey}/${id.toLowerCase()}`;
                    if (operationIds.has(operationKey)) {
                        errors.push(`${itemPath}.id duplicates operation "${id}" for "${connectorId}".`);
                    } else {
                        operationIds.add(operationKey);
                    }
                }
            }

            if (Object.prototype.hasOwnProperty.call(operation, 'inputs')) {
                validateInputs(operation.inputs, `${itemPath}.inputs`, errors);
            }
        });
    }

    for (const [connectorId, state] of connectorStates) {
        const operationCount = operationCounts.get(connectorId) ?? 0;
        const incompleteCount = incompleteCounts.get(connectorId) ?? 0;
        if (state === 'catalogOnly' && operationCount !== 0) {
            errors.push(`Connector "${connectorId}" is catalogOnly but has operations.`);
        } else if (state === 'complete' && (operationCount === 0 || incompleteCount !== 0)) {
            errors.push(`Connector "${connectorId}" is complete but has missing operation inputs.`);
        } else if (state === 'partial' && (operationCount === 0 || incompleteCount === 0)) {
            errors.push(`Connector "${connectorId}" is partial without an unavailable input schema.`);
        }
    }

    return errors;
}

export function measureConnectorCatalog(catalog: IConnectorCatalogManifest): ConnectorCatalogSize {
    const contents = JSON.stringify(catalog);
    return {
        rawBytes: Buffer.byteLength(contents),
        gzipBytes: gzipSync(contents).byteLength,
    };
}

function createOperations(
    connectorId: string,
    operationCatalogValue: unknown,
    swaggerValue: unknown,
): IConnectorCatalogOperation[] {
    if (operationCatalogValue === undefined) {
        return [];
    }

    const result: IConnectorCatalogOperation[] = [];
    for (const value of readCollection(operationCatalogValue)) {
        const operation = asRecord(value);
        const properties = asRecord(operation?.properties);
        const id = readString(operation?.name);
        if (!operation || !properties || !id || !isTriggerOperation(properties)) {
            continue;
        }

        const visibility = readString(properties.visibility)?.toLowerCase();
        if (visibility === 'internal' || visibility === 'hideinui') {
            continue;
        }

        const inputs = swaggerValue === undefined ?
            undefined :
            parseConnectorSwaggerInputs(swaggerValue, id);
        result.push(compactObject({
            id,
            connectorId,
            name: readString(properties.summary) ?? id,
            description: readString(properties.triggerHint) ?? readString(properties.description),
            visibility,
            delivery: getDelivery(properties),
            inputs: inputs?.map(toCatalogInput),
        }));
    }

    return result;
}

function toCatalogInput(
    input: ReturnType<typeof parseConnectorSwaggerInputs> extends (infer T)[] | undefined ? T : never,
): IConnectorCatalogInputDefinition {
    return compactObject({
        name: input.name,
        label: input.label,
        description: input.description,
        type: input.type,
        format: input.format,
        required: input.required,
        defaultValue: input.sensitive ? undefined : input.defaultValue,
        options: input.options?.map(option => ({
            label: option.label,
            value: option.value,
        })),
        dynamic: input.dynamic,
        sensitive: input.sensitive,
        visibility: input.visibility,
    });
}

function isTriggerOperation(properties: JsonRecord): boolean {
    return properties.isTrigger === true ||
        readString(properties.operationRole)?.toLowerCase() === 'trigger' ||
        properties.trigger !== undefined ||
        properties.isWebhook === true ||
        properties.isNotification === true;
}

function getDelivery(properties: JsonRecord): ConnectorCatalogDelivery {
    if (properties.isWebhook === true) {
        return 'webhook';
    }
    if (properties.isNotification === true) {
        return 'notification';
    }
    return 'polling';
}

function validateInputs(value: unknown, valuePath: string, errors: string[]): void {
    const inputs = requireArray(value, valuePath, errors);
    inputs?.forEach((inputValue, index) => {
        const inputPath = `${valuePath}[${index}]`;
        const input = requireObject(inputValue, inputPath, errors);
        if (!input) {
            return;
        }

        validateKeys(input, inputPath, [
            'name', 'label', 'description', 'type', 'format', 'required', 'defaultValue',
            'options', 'dynamic', 'sensitive', 'visibility',
        ], errors);
        validateNonEmptyString(input.name, `${inputPath}.name`, errors);
        validateNonEmptyString(input.label, `${inputPath}.label`, errors);
        validateOptionalString(input.description, `${inputPath}.description`, errors);
        validateOptionalString(input.format, `${inputPath}.format`, errors);
        validateOptionalString(input.visibility, `${inputPath}.visibility`, errors);
        if (!['array', 'boolean', 'integer', 'number', 'object', 'string'].includes(String(input.type))) {
            errors.push(`${inputPath}.type is invalid.`);
        }
        validateBoolean(input.required, `${inputPath}.required`, errors);
        validateBoolean(input.dynamic, `${inputPath}.dynamic`, errors);
        validateBoolean(input.sensitive, `${inputPath}.sensitive`, errors);
        if (input.defaultValue !== undefined &&
            typeof input.defaultValue !== 'string' &&
            typeof input.defaultValue !== 'number' &&
            typeof input.defaultValue !== 'boolean') {
            errors.push(`${inputPath}.defaultValue must be a primitive.`);
        }
        if (input.sensitive === true && input.defaultValue !== undefined) {
            errors.push(`${inputPath}.defaultValue must be omitted for sensitive inputs.`);
        }
        if (input.options !== undefined) {
            const options = requireArray(input.options, `${inputPath}.options`, errors);
            options?.forEach((optionValue, optionIndex) => {
                const optionPath = `${inputPath}.options[${optionIndex}]`;
                const option = requireObject(optionValue, optionPath, errors);
                if (!option) {
                    return;
                }
                validateKeys(option, optionPath, ['label', 'value'], errors);
                validateString(option.label, `${optionPath}.label`, errors);
                validateString(option.value, `${optionPath}.value`, errors);
            });
        }
    });
}

function validateKeys(
    value: JsonRecord,
    valuePath: string,
    allowedKeys: readonly string[],
    errors: string[],
): void {
    const allowed = new Set(allowedKeys);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            errors.push(`${valuePath}.${key} is not allowed.`);
        }
    }
}

function requireObject(value: unknown, valuePath: string, errors: string[]): JsonRecord | undefined {
    const result = asRecord(value);
    if (!result) {
        errors.push(`${valuePath} must be an object.`);
    }
    return result;
}

function requireArray(value: unknown, valuePath: string, errors: string[]): unknown[] | undefined {
    if (!Array.isArray(value)) {
        errors.push(`${valuePath} must be an array.`);
        return undefined;
    }
    return value;
}

function validateDateTime(value: unknown, valuePath: string, errors: string[]): void {
    if (typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) ||
        Number.isNaN(Date.parse(value))) {
        errors.push(`${valuePath} must be an ISO 8601 UTC timestamp.`);
    }
}

function validateNonEmptyString(
    value: unknown,
    valuePath: string,
    errors: string[],
): string | undefined {
    if (typeof value !== 'string' || value.length === 0) {
        errors.push(`${valuePath} must be a non-empty string.`);
        return undefined;
    }
    return value;
}

function validateString(value: unknown, valuePath: string, errors: string[]): void {
    if (typeof value !== 'string') {
        errors.push(`${valuePath} must be a string.`);
    }
}

function validateOptionalString(value: unknown, valuePath: string, errors: string[]): void {
    if (value !== undefined) {
        validateNonEmptyString(value, valuePath, errors);
    }
}

function validateBoolean(value: unknown, valuePath: string, errors: string[]): void {
    if (typeof value !== 'boolean') {
        errors.push(`${valuePath} must be a boolean.`);
    }
}

function readCollection(value: unknown, alternateProperty?: string): unknown[] {
    if (Array.isArray(value)) {
        return value;
    }

    const record = asRecord(value);
    const candidate = record?.value ?? (alternateProperty ? record?.[alternateProperty] : undefined);
    if (!Array.isArray(candidate)) {
        throw new Error('The source JSON does not contain an array payload.');
    }
    return candidate;
}

function compactObject<T extends JsonRecord>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(([, item]) => item !== undefined),
    ) as T;
}

function normalizeHttpsUrl(value: unknown): string | undefined {
    const url = readString(value);
    if (!url) {
        return undefined;
    }
    if (url.startsWith('//')) {
        return `https:${url}`;
    }
    if (!/^[a-z][a-z\d+.-]*:\/\//i.test(url)) {
        return `https://${url}`;
    }
    return url.replace(/^http:\/\//i, 'https://');
}

function asRecord(value: unknown): JsonRecord | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ?
        value as JsonRecord :
        undefined;
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function runCli(): Promise<void> {
    const args = process.argv.slice(2);
    const manifestPath = path.resolve(
        readOption(args, '--manifest') ??
        path.join('resources', 'backupProjectTemplates', 'manifest.json'),
    );

    if (args.includes('--generate')) {
        const managedApisPath = requireOption(args, '--managed-apis');
        const operationsDirectory = requireOption(args, '--operations-dir');
        const swaggerDirectory = requireOption(args, '--swagger-dir');
        const generatedAt = requireOption(args, '--generated-at');
        const region = requireOption(args, '--region');
        const connectorIds = (readOption(args, '--connectors') ??
            bundledConnectorCatalogIds.join(','))
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);

        const operationCatalogs: Record<string, unknown> = {};
        const swaggerDocuments: Record<string, unknown> = {};
        for (const connectorId of connectorIds) {
            operationCatalogs[connectorId] = await readSourceFile(
                operationsDirectory,
                connectorId,
                'operations-',
            );
            swaggerDocuments[connectorId] = await readSourceFile(
                swaggerDirectory,
                connectorId,
                'swagger-',
            );
        }

        const catalog = generateConnectorCatalog({
            generatedAt,
            source: {
                kind: 'azure-managed-connectors',
                cloud: readOption(args, '--cloud') ?? 'AzureCloud',
                region,
                catalogApiVersion: readOption(args, '--catalog-api-version') ?? '2022-09-01-preview',
                operationsApiVersion: readOption(args, '--operations-api-version') ?? '2016-06-01',
                swaggerApiVersion: readOption(args, '--swagger-api-version') ?? '2022-09-01-preview',
            },
            connectorIds,
            managedApis: await readJson(managedApisPath),
            operationCatalogs,
            swaggerDocuments,
        });
        const errors = validateConnectorCatalog(catalog);
        if (errors.length > 0) {
            throw new Error(errors.join('\n'));
        }
        if (!args.includes('--allow-partial') &&
            catalog.connectors.some(connector => connector.metadataState !== 'complete')) {
            throw new Error('Generated catalog is incomplete. Pass --allow-partial to retain partial metadata.');
        }

        const manifest = asRecord(await readJson(manifestPath));
        if (!manifest || !Array.isArray(manifest.templates)) {
            throw new Error(`Invalid project template manifest: ${manifestPath}`);
        }
        manifest.connectorCatalog = catalog;
        await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }

    const manifestContents = await fs.readFile(manifestPath, 'utf8');
    const manifest = asRecord(JSON.parse(manifestContents));
    const errors = validateConnectorCatalog(manifest?.connectorCatalog);
    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }
    const normalizedManifestContents = manifestContents.replace(/\r\n/g, '\n');
    if (normalizedManifestContents !== `${JSON.stringify(manifest, null, 2)}\n`) {
        throw new Error('Project template manifest is not deterministically formatted.');
    }

    const catalog = manifest?.connectorCatalog as unknown as IConnectorCatalogManifest;
    const size = measureConnectorCatalog(catalog);
    process.stdout.write(
        `Connector catalog valid: ${catalog.connectors.length} connectors, ` +
        `${catalog.operations.length} operations, ${size.rawBytes} raw bytes, ` +
        `${size.gzipBytes} gzip bytes; manifest ${Buffer.byteLength(manifestContents)} bytes.\n`,
    );
}

async function readSourceFile(
    directory: string,
    connectorId: string,
    prefix: string,
): Promise<unknown> {
    const directPath = path.join(directory, `${connectorId}.json`);
    const prefixedPath = path.join(directory, `${prefix}${connectorId}.json`);
    try {
        return await readJson(directPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
        return await readJson(prefixedPath);
    }
}

async function readJson(filePath: string): Promise<unknown> {
    const contents = await fs.readFile(path.resolve(filePath), 'utf8');
    return JSON.parse(contents.replace(/^\uFEFF/, '')) as unknown;
}

function readOption(args: readonly string[], option: string): string | undefined {
    const index = args.indexOf(option);
    return index === -1 ? undefined : args[index + 1];
}

function requireOption(args: readonly string[], option: string): string {
    const value = readOption(args, option);
    if (!value) {
        throw new Error(`Missing required option ${option}.`);
    }
    return value;
}

if (require.main === module) {
    runCli().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
