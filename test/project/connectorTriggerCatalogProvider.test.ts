/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import {
    ConnectorTriggerCatalogCache,
    type ConnectorTriggerManifestResult,
    type IConnectorTriggerCatalogCache,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerCatalogCache';
import {
    ConnectorCatalogError,
    ConnectorCatalogLiveLoadError,
    ConnectorTriggerCatalogProvider,
    type ConnectorCatalogPublicSource,
    type ConnectorTriggerCatalog,
} from '../../src/commands/createNewProject/connectorTriggerPicker/ConnectorTriggerCatalogProvider';
import { type ITemplateManifest } from '../../src/templates/projectTemplates/IProjectTemplate';

suite('Connector trigger catalog provider', () => {
    test('loads the optional catalog through the shared remote manifest cache', async () => {
        const context = await createTestActionContext();
        const provider = new ConnectorTriggerCatalogProvider(new TestCatalogCache(
            createManifestResult(createManifest(createSnapshotCatalog()), 'remote'),
        ));

        const result = await provider.getCatalog(context);

        assert.strictEqual(result.source, 'remote');
        assert.strictEqual(result.liveRefresh, 'notRequested');
        assert.deepStrictEqual(result.errors, []);
        assert.deepStrictEqual(
            result.catalog.connectors.map(connector => ({
                availability: connector.availability,
                id: connector.id,
            })),
            [
                { availability: 'unknown', id: 'office365' },
                { availability: 'unknown', id: 'sharepointonline' },
            ],
        );
        assert.deepStrictEqual(
            result.catalog.operations.map(operation => operation.id),
            ['OnNewEmail', 'OnNewFile'],
        );
        assert.strictEqual(
            result.catalog.operations[0].inputDefinitions?.[0].name,
            'folderPath',
        );
        assert.deepStrictEqual(result.snapshotSource, {
            catalogApiVersion: '2022-09-01-preview',
            cloud: 'AzureCloud',
            kind: 'azure-managed-connectors',
            operationsApiVersion: '2016-06-01',
            region: 'westcentralus',
            swaggerApiVersion: '2022-09-01-preview',
        });
        assert.strictEqual(context.telemetry.properties.connectorCatalogSource, 'remote');
        assert.strictEqual(
            context.telemetry.properties.connectorCatalogLiveRefresh,
            'notRequested',
        );
    });

    test('falls back to the bundled snapshot when the remote manifest omits the catalog', async () => {
        const context = await createTestActionContext();
        const provider = new ConnectorTriggerCatalogProvider(new TestCatalogCache(
            createManifestResult(createManifest(), 'remote'),
            createManifest(createSnapshotCatalog()),
        ));

        const result = await provider.getCatalog(context);

        assert.strictEqual(result.source, 'bundled');
        assert.deepStrictEqual(result.errors, [
            ConnectorCatalogError.RemoteCatalogMissing,
        ]);
        assert.strictEqual(context.telemetry.properties.connectorCatalogSource, 'bundled');
        assert.strictEqual(
            context.telemetry.properties.connectorCatalogErrors,
            ConnectorCatalogError.RemoteCatalogMissing,
        );
    });

    test('reports the shared manifest cache as a remote cache source', async () => {
        const provider = new ConnectorTriggerCatalogProvider(new TestCatalogCache(
            createManifestResult(
                createManifest(createSnapshotCatalog()),
                'remoteCache',
            ),
        ));

        const result = await provider.getCatalog(await createTestActionContext());

        assert.strictEqual(result.source, 'remoteCache');
    });

    test('passes snapshot source metadata and reconciles stable live IDs', async () => {
        const context = await createTestActionContext();
        const provider = new ConnectorTriggerCatalogProvider(new TestCatalogCache(
            createManifestResult(
                createManifest(createSnapshotCatalog()),
                'bundled',
            ),
        ));

        const result = await provider.getCatalog(context, async baseline => {
            assert.strictEqual(baseline?.snapshotSource.cloud, 'AzureCloud');
            assert.strictEqual(baseline?.snapshotSource.region, 'westcentralus');
            return {
                connectors: [
                    {
                        id: 'OFFICE365',
                        label: 'Microsoft 365 Outlook',
                        description: 'Live description.',
                    },
                    {
                        id: 'teams',
                        label: 'Microsoft Teams',
                    },
                ],
                operations: [
                    {
                        id: 'onnewemail',
                        connectorId: 'OFFICE365',
                        label: 'When live email arrives',
                        isWebhook: false,
                        isNotification: true,
                    },
                    {
                        id: 'OnNewMessage',
                        connectorId: 'teams',
                        label: 'When a message is added',
                        isWebhook: false,
                        isNotification: false,
                    },
                ],
            };
        });

        assert.strictEqual(result.source, 'live');
        assert.strictEqual(result.baselineSource, 'bundled');
        assert.strictEqual(result.liveRefresh, 'succeeded');
        assert.deepStrictEqual(
            result.catalog.connectors.map(connector => ({
                availability: connector.availability,
                id: connector.id,
                label: connector.label,
            })),
            [
                {
                    availability: 'available',
                    id: 'office365',
                    label: 'Microsoft 365 Outlook',
                },
                {
                    availability: 'available',
                    id: 'teams',
                    label: 'Microsoft Teams',
                },
                {
                    availability: 'unavailable',
                    id: 'sharepointonline',
                    label: 'SharePoint',
                },
            ],
        );
        assert.deepStrictEqual(
            result.catalog.operations.map(operation => ({
                availability: operation.availability,
                connectorId: operation.connectorId,
                id: operation.id,
                label: operation.label,
            })),
            [
                {
                    availability: 'available',
                    connectorId: 'office365',
                    id: 'OnNewEmail',
                    label: 'When live email arrives',
                },
                {
                    availability: 'unavailable',
                    connectorId: 'sharepointonline',
                    id: 'OnNewFile',
                    label: 'When a file is created',
                },
                {
                    availability: 'available',
                    connectorId: 'teams',
                    id: 'OnNewMessage',
                    label: 'When a message is added',
                },
            ],
        );
        assert.strictEqual(
            result.catalog.operations[0].inputDefinitions?.[0].name,
            'folderPath',
        );
    });

    test('falls back to public data with bounded telemetry when live refresh fails', async () => {
        const context = await createTestActionContext();
        const provider = new ConnectorTriggerCatalogProvider(new TestCatalogCache(
            createManifestResult(
                createManifest(createSnapshotCatalog()),
                'remote',
            ),
        ));

        const result = await provider.getCatalog(context, async () => {
            throw new Error('customer-resource-name and secret value');
        });

        assert.strictEqual(result.source, 'remote');
        assert.strictEqual(result.liveRefresh, 'failed');
        assert.deepStrictEqual(result.errors, [
            ConnectorCatalogError.LiveCatalogUnavailable,
        ]);
        assert.strictEqual(
            context.telemetry.properties.connectorCatalogErrors,
            ConnectorCatalogError.LiveCatalogUnavailable,
        );
        assert.ok(!JSON.stringify(context.telemetry.properties).includes('customer-resource-name'));
        assert.ok(!JSON.stringify(context.telemetry.properties).includes('secret value'));
    });

    test('preserves bounded live skip reasons for the caller', async () => {
        const provider = new ConnectorTriggerCatalogProvider(new TestCatalogCache(
            createManifestResult(
                createManifest(createSnapshotCatalog()),
                'remote',
            ),
        ));

        const result = await provider.getCatalog(
            await createTestActionContext(),
            async () => {
                throw new ConnectorCatalogLiveLoadError(
                    ConnectorCatalogError.LiveCloudMismatch,
                );
            },
        );

        assert.strictEqual(result.source, 'remote');
        assert.strictEqual(result.liveRefresh, 'failed');
        assert.deepStrictEqual(result.errors, [
            ConnectorCatalogError.LiveCloudMismatch,
        ]);
    });

    test('uses namespace live data when the public manifest is unavailable', async () => {
        const context = await createTestActionContext();
        const provider = new ConnectorTriggerCatalogProvider({
            async getManifest(): Promise<ConnectorTriggerManifestResult> {
                throw new Error('Unavailable');
            },
            async getBundledManifest(): Promise<unknown> {
                throw new Error('Unavailable');
            },
        });

        const result = await provider.getCatalog(
            context,
            async baseline => {
                assert.strictEqual(baseline, undefined);
                return createNormalizedCatalog();
            },
        );

        assert.strictEqual(result.source, 'live');
        assert.strictEqual(result.baselineSource, undefined);
        assert.deepStrictEqual(result.errors, [
            ConnectorCatalogError.RemoteManifestUnavailable,
            ConnectorCatalogError.BundledManifestUnavailable,
        ]);
        assert.ok(result.catalog.connectors.every(
            connector => connector.availability === 'available',
        ));
    });

    test('reuses ProjectTemplateProvider manifest results in memory', async () => {
        let callCount = 0;
        const context = await createTestActionContext();
        const cache = new ConnectorTriggerCatalogCache({
            async getManifest(actionContext: IActionContext): Promise<ITemplateManifest> {
                callCount += 1;
                actionContext.telemetry.properties.manifestSource = 'cache';
                return createManifest(createSnapshotCatalog()) as unknown as ITemplateManifest;
            },
        });

        await cache.getManifest(context);
        await cache.getManifest(context);
        assert.strictEqual(callCount, 1);
    });
});

class TestCatalogCache implements IConnectorTriggerCatalogCache {
    public constructor(
        private readonly primary: ConnectorTriggerManifestResult,
        private readonly bundled?: unknown,
    ) { }

    public async getManifest(): Promise<ConnectorTriggerManifestResult> {
        return this.primary;
    }

    public async getBundledManifest(): Promise<unknown> {
        return this.bundled ?? assert.fail('Bundled fallback should not be loaded.');
    }
}

function createManifestResult(
    manifest: unknown,
    source: ConnectorCatalogPublicSource,
): ConnectorTriggerManifestResult {
    return { manifest, source };
}

function createManifest(
    connectorCatalog?: unknown,
): Record<string, unknown> {
    return {
        generatedAt: '2026-10-30T00:00:00Z',
        version: '1.0',
        templates: [],
        ...(connectorCatalog === undefined ? {} : { connectorCatalog }),
    };
}

function createSnapshotCatalog(): Record<string, unknown> {
    return {
        generatedAt: '2026-10-30T00:00:00Z',
        source: {
            catalogApiVersion: '2022-09-01-preview',
            cloud: 'AzureCloud',
            kind: 'azure-managed-connectors',
            operationsApiVersion: '2016-06-01',
            region: 'westcentralus',
            swaggerApiVersion: '2022-09-01-preview',
        },
        version: '1.0.0',
        connectors: [
            {
                id: 'office365',
                metadataState: 'complete',
                name: 'Office 365 Outlook',
                iconUrl: 'https://example.com/office365.png',
            },
            {
                id: 'sharepointonline',
                metadataState: 'complete',
                name: 'SharePoint',
            },
            {
                id: 'internal-connector',
                metadataState: 'catalogOnly',
                name: 'Internal connector',
                visibility: 'internal',
            },
            {
                id: 'teams',
                metadataState: 'partial',
                name: 'Microsoft Teams',
            },
        ],
        operations: [
            {
                connectorId: 'office365',
                delivery: 'notification',
                id: 'OnNewEmail',
                inputs: [
                    {
                        dynamic: true,
                        label: 'Folder',
                        name: 'folderPath',
                        required: true,
                        sensitive: false,
                        type: 'string',
                    },
                ],
                name: 'When an email arrives',
                visibility: 'important',
            },
            {
                connectorId: 'sharepointonline',
                delivery: 'polling',
                id: 'OnNewFile',
                name: 'When a file is created',
            },
            {
                connectorId: 'office365',
                delivery: 'polling',
                id: 'InternalOperation',
                name: 'Internal operation',
                visibility: 'internal',
            },
            {
                connectorId: 'internal-connector',
                delivery: 'polling',
                id: 'InternalConnectorOperation',
                name: 'Internal connector operation',
            },
            ...Array.from({ length: 7 }, (_, index) => ({
                connectorId: 'teams',
                delivery: 'webhook',
                id: `TeamsWebhook${index + 1}`,
                name: `Teams webhook ${index + 1}`,
            })),
        ],
    };
}

function createNormalizedCatalog(): ConnectorTriggerCatalog {
    return {
        connectors: [
            {
                id: 'office365',
                label: 'Office 365 Outlook',
            },
        ],
        operations: [
            {
                connectorId: 'office365',
                id: 'OnNewEmail',
                isNotification: true,
                isWebhook: false,
                label: 'When an email arrives',
            },
        ],
    };
}
