/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Position, Uri, WorkspaceEdit, workspace } from 'vscode';
import {
    ConnectorTriggerProjectMetadataError,
    readConnectorTriggerEventDeliveryModes,
    readConnectorTriggerPollEvents,
    readConnectorTriggerProjectEvents,
    readConnectorTriggerProjectMetadata,
} from '../../src/connectorTrigger/connectorTriggerProjectMetadata';

suite('Connector trigger project metadata', () => {
    let projectPath: string;
    let settingsPath: string;

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'azfunc-connector-metadata-'));
        settingsPath = path.join(projectPath, '.vscode', 'settings.json');
    });

    teardown(async () => {
        await fs.promises.rm(projectPath, { recursive: true, force: true });
    });

    async function writeEvents(events: unknown): Promise<void> {
        await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
        await fs.promises.writeFile(settingsPath, JSON.stringify({ 'azureFunctions.connectorTriggerEvents': events }));
    }

    test('returns no events without creating files when metadata is absent', async () => {
        assert.strictEqual(await readConnectorTriggerProjectMetadata(projectPath), undefined);
        assert.deepStrictEqual(await readConnectorTriggerProjectEvents(projectPath), []);
        assert.deepStrictEqual(await readConnectorTriggerPollEvents(projectPath), []);
        assert.strictEqual(await readConnectorTriggerEventDeliveryModes(projectPath), undefined);
        assert.deepStrictEqual(await fs.promises.readdir(projectPath), []);
    });

    test('reads project-local JSONC without changing it', async () => {
        await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
        const contents = '\uFEFF{\r\n// Keep the authoring record.\r\n"azureFunctions.connectorTriggerEvents": [{"connectorId":"office365","operationId":"OnNewEmailV3","deliveryMode":"poll"}],\r\n}\r\n';
        await fs.promises.writeFile(settingsPath, contents);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(projectPath), {
            connectorId: 'office365', operationId: 'OnNewEmailV3',
        });
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), contents);
    });

    test('preserves modes and authoring context while returning only polling events to F5', async () => {
        const azureContext = {
            subscriptionId: 'authored-subscription', accountId: 'authored-account',
            tenantId: 'authored-tenant', environmentName: 'AzureCloud', region: 'westus',
        };
        await writeEvents([
            { connectorId: 'office365', operationId: 'OnNewEmailV3', deliveryMode: 'poll', azureContext },
            { connectorId: 'office365', operationId: 'OnFlaggedEmailV4', functionName: 'OnFlaggedEmail', deliveryMode: 'webhook' },
        ]);
        assert.deepStrictEqual(await readConnectorTriggerProjectEvents(projectPath), [
            { connectorId: 'office365', operationId: 'OnNewEmailV3', deliveryMode: 'poll', azureContext },
            { connectorId: 'office365', operationId: 'OnFlaggedEmailV4', functionName: 'OnFlaggedEmail', deliveryMode: 'webhook' },
        ]);
        assert.deepStrictEqual(await readConnectorTriggerPollEvents(projectPath), [
            { connectorId: 'office365', operationId: 'OnNewEmailV3', azureContext },
        ]);
        assert.deepStrictEqual(await readConnectorTriggerEventDeliveryModes(projectPath), ['poll', 'webhook']);
        await assert.rejects(readConnectorTriggerProjectMetadata(projectPath), isInvalidSchema);
    });

    test('rejects invalid event records without disclosing their contents', async () => {
        for (const events of [
            null,
            [{ connectorId: 'rss', operationId: 'OnNewFeed' }],
            [{ connectorId: 'rss', operationId: 'OnNewFeed', deliveryMode: 'push' }],
            [{ connectorId: 'rss', operationId: 'OnNewFeed', deliveryMode: 'poll', functionName: '../other' }],
            [{ connectorId: 'rss', operationId: 'OnNewFeed', deliveryMode: 'poll', parameters: 'private-value' }],
            [{ connectorId: 'rss', operationId: 'OnNewFeed', deliveryMode: 'poll', azureContext: { clientSecret: 'private-value' } }],
        ]) {
            await writeEvents(events);
            await assert.rejects(readConnectorTriggerProjectEvents(projectPath), error =>
                isInvalidSchema(error) && !error.message.includes('private-value'));
        }
    });

    test('rejects unsaved event settings instead of reading stale data', async () => {
        await writeEvents([{ connectorId: 'rss', operationId: 'OnNewFeed', deliveryMode: 'poll' }]);
        const contents = await fs.promises.readFile(settingsPath, 'utf8');
        const document = await workspace.openTextDocument(Uri.file(settingsPath));
        const edit = new WorkspaceEdit();
        edit.insert(document.uri, new Position(0, 0), '// Unsaved change.\n');
        assert.strictEqual(await workspace.applyEdit(edit), true);
        try {
            await assert.rejects(readConnectorTriggerProjectMetadata(projectPath), error =>
                error instanceof ConnectorTriggerProjectMetadataError && error.code === 'SettingsNotSaved');
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), contents);
        } finally {
            await document.save();
        }
    });

    test('does not make unrelated incomplete settings block projects without connector events', async () => {
        await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
        await fs.promises.writeFile(settingsPath, '{ "editor.tabSize": ');
        assert.strictEqual(await readConnectorTriggerProjectMetadata(projectPath), undefined);
    });

    test('rejects incomplete connector event JSON', async () => {
        await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
        await fs.promises.writeFile(settingsPath, '{ "azureFunctions.connectorTriggerEvents": [');
        await assert.rejects(readConnectorTriggerProjectEvents(projectPath), error =>
            error instanceof ConnectorTriggerProjectMetadataError && error.code === 'InvalidJson');
    });

    test('only reads events from the selected project', async () => {
        const child = path.join(projectPath, 'child');
        await writeEvents([{ connectorId: 'rss', operationId: 'OnNewFeed', deliveryMode: 'poll' }]);
        assert.strictEqual(await readConnectorTriggerProjectMetadata(child), undefined);
    });
});

function isInvalidSchema(error: unknown): error is ConnectorTriggerProjectMetadataError {
    return error instanceof ConnectorTriggerProjectMetadataError && error.code === 'InvalidSchema';
}
