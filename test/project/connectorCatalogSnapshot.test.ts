/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import fs from 'fs';
import * as path from 'path';
import {
    bundledConnectorCatalogIds,
    generateConnectorCatalog,
    measureConnectorCatalog,
    validateConnectorCatalog,
} from '../../scripts/generateConnectorCatalog';
import {
    connectorCatalogVersion,
    type IConnectorCatalogManifest,
} from '../../src/templates/projectTemplates/IConnectorCatalogManifest';

suite('Connector catalog snapshot', () => {
    const manifestPath = path.resolve(
        __dirname,
        '..',
        '..',
        'resources',
        'backupProjectTemplates',
        'manifest.json',
    );

    test('is deterministic, complete, and contains only the prioritized connectors', () => {
        const contents = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(contents) as {
            totalTemplates: number;
            templates: unknown[];
            connectorCatalog: IConnectorCatalogManifest;
        };
        const catalog = manifest.connectorCatalog;

        assert.deepStrictEqual(validateConnectorCatalog(catalog), []);
        assert.strictEqual(
            contents.replace(/\r\n/g, '\n'),
            `${JSON.stringify(manifest, null, 2)}\n`,
        );
        assert.strictEqual(manifest.totalTemplates, manifest.templates.length);
        assert.strictEqual(catalog.version, connectorCatalogVersion);
        assert.deepStrictEqual(
            catalog.connectors.map(connector => connector.id),
            bundledConnectorCatalogIds,
        );
        assert.ok(catalog.connectors.every(connector => connector.metadataState === 'complete'));
        assert.deepStrictEqual(
            Object.fromEntries(bundledConnectorCatalogIds.map(connectorId => [
                connectorId,
                catalog.operations.filter(operation => operation.connectorId === connectorId).length,
            ])),
            {
                office365: 9,
                sharepointonline: 12,
                onedriveforbusiness: 4,
                teams: 11,
                planner: 3,
                salesforce: 2,
                visualstudioteamservices: 9,
                dataflows: 1,
            },
        );
        assert.ok(catalog.operations.every(operation => operation.inputs !== undefined));
        assert.ok(measureConnectorCatalog(catalog).rawBytes > 0);
    });

    test('does not retain dynamic invocation, credentials, or customer resource fields', () => {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
            connectorCatalog: IConnectorCatalogManifest;
        };
        const forbiddenKeys = new Set([
            'accesstoken',
            'clientsecret',
            'connectionid',
            'connectionparameters',
            'dynamicinvoke',
            'resourcegroup',
            'runtimeurls',
            'subscriptionid',
            'token',
            'x-ms-dynamic-list',
            'x-ms-dynamic-properties',
            'x-ms-dynamic-schema',
            'x-ms-dynamic-tree',
            'x-ms-dynamic-values',
        ]);

        visitKeys(manifest.connectorCatalog, key => {
            assert.ok(!forbiddenKeys.has(key.toLowerCase()), `Forbidden catalog key: ${key}`);
        });
    });

    test('joins curated operation membership with allowlisted Swagger input metadata', () => {
        const catalog = generateConnectorCatalog({
            generatedAt: '2026-10-30T19:22:40Z',
            source: {
                kind: 'azure-managed-connectors',
                cloud: 'AzureCloud',
                region: 'westcentralus',
                catalogApiVersion: '2022-09-01-preview',
                operationsApiVersion: '2016-06-01',
                swaggerApiVersion: '2022-09-01-preview',
            },
            connectorIds: ['sample'],
            managedApis: {
                value: [{
                    name: 'sample',
                    properties: {
                        generalInformation: {
                            displayName: 'Sample',
                            iconUrl: 'http://example.com/icon.png',
                        },
                    },
                }],
            },
            operationCatalogs: {
                sample: {
                    value: [{
                        name: 'ListItems',
                        properties: { summary: 'List items' },
                    }, {
                        name: 'SecondEvent',
                        properties: {
                            summary: 'When a second event occurs',
                            trigger: 'batch',
                        },
                    }, {
                        name: 'OnEvent',
                        properties: {
                            summary: 'When an event occurs',
                            trigger: 'batch',
                            isNotification: true,
                            visibility: 'important',
                        },
                    }, {
                        name: 'InternalEvent',
                        properties: {
                            summary: 'Internal event',
                            trigger: 'batch',
                            visibility: 'internal',
                        },
                    }],
                },
            },
            swaggerDocuments: {
                sample: {
                    paths: {
                        '/second-events': {
                            get: {
                                operationId: 'SecondEvent',
                                parameters: [],
                            },
                        },
                        '/events': {
                            get: {
                                operationId: 'OnEvent',
                                parameters: [{
                                    name: 'folder',
                                    in: 'query',
                                    type: 'string',
                                    'x-ms-dynamic-values': {
                                        operationId: 'ListFolders',
                                    },
                                }, {
                                    name: 'credential',
                                    in: 'query',
                                    type: 'string',
                                    default: 'must-not-be-copied',
                                    'x-ms-secret': true,
                                }],
                            },
                        },
                    },
                },
            },
        });

        assert.deepStrictEqual(validateConnectorCatalog(catalog), []);
        assert.deepStrictEqual(catalog.connectors, [{
            id: 'sample',
            name: 'Sample',
            iconUrl: 'https://example.com/icon.png',
            metadataState: 'complete',
        }]);
        assert.deepStrictEqual(catalog.operations.map(operation => operation.id), [
            'SecondEvent',
            'OnEvent',
        ]);
        assert.deepStrictEqual(catalog.operations[0].inputs, []);
        assert.strictEqual(catalog.operations[1].delivery, 'notification');
        assert.deepStrictEqual(catalog.operations[1].inputs, [{
            name: 'folder',
            label: 'Folder',
            type: 'string',
            required: false,
            dynamic: true,
            sensitive: false,
        }, {
            name: 'credential',
            label: 'Credential',
            type: 'string',
            required: false,
            dynamic: false,
            sensitive: true,
        }]);
        const serialized = JSON.stringify(catalog);
        assert.ok(!serialized.includes('ListFolders'));
        assert.ok(!serialized.includes('must-not-be-copied'));
    });
});

function visitKeys(value: unknown, visitor: (key: string) => void): void {
    if (Array.isArray(value)) {
        value.forEach(item => visitKeys(item, visitor));
    } else if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) {
            visitor(key);
            visitKeys(child, visitor);
        }
    }
}
