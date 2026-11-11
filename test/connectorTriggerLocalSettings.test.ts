/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Position, Uri, WorkspaceEdit, workspace } from 'vscode';
import { FileConnectorTriggerLocalSettingsWriter } from '../src/debug/connectorNamespace/ConnectorTriggerLocalSettingsWriter';
import { ConnectorTriggerLocalSettingsChangedError } from '../src/debug/connectorNamespace/connectorTriggerF5Contracts';
import { parseJson } from '../src/utils/parseJson';

suite('Connector Trigger safe local settings', () => {
    let projectPath: string;
    let settingsPath: string;
    const values = {
        ['FixtureConnector__pollingEndpoint']: 'https://example.invalid/api/connectorGateways/fixture',
        FixtureTriggerConfig: 'fixture-trigger',
    };

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-settings-'));
        settingsPath = path.join(projectPath, 'local.settings.json');
    });

    teardown(async () => {
        const document = workspace.textDocuments.find(document => document.uri.fsPath === settingsPath);
        if (document?.isDirty) {
            await document.save();
        }
        await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
    });

    test('preserves JSONC, BOM, existing unrelated/configured values and idempotent writes', async () => {
        const original = '\uFEFF{\r\n    // Keep this comment.\r\n    "IsEncrypted": false,\r\n    "Values": {\r\n        "OtherTrigger": "keep-this-config",\r\n        "OtherConnection__pollingEndpoint": "https://other.invalid"\r\n    },\r\n    "Host": { "LocalHttpPort": 7073 },\r\n}\r\n';
        await fs.promises.writeFile(settingsPath, original, 'utf8');
        const writer = new FileConnectorTriggerLocalSettingsWriter();
        const context = await createTestActionContext();
        await writer.write(context, projectPath, values);
        const first = await fs.promises.readFile(settingsPath, 'utf8');
        assert.ok(first.startsWith('\uFEFF'));
        assert.ok(first.includes('// Keep this comment.\r\n'));
        assert.deepStrictEqual(parseJson(first), {
            IsEncrypted: false,
            Values: {
                OtherTrigger: 'keep-this-config',
                ['OtherConnection__pollingEndpoint']: 'https://other.invalid',
                ...values,
            },
            Host: { LocalHttpPort: 7073 },
        });
        await writer.write(context, projectPath, values);
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), first);
    });

    test('rejects without editing when reviewed settings changed before writing', async () => {
        const original = '{"IsEncrypted":false,"Values":{"FixtureTriggerConfig":"added-later"}}';
        await fs.promises.writeFile(settingsPath, original);
        await assert.rejects(
            new FileConnectorTriggerLocalSettingsWriter().write(await createTestActionContext(), projectPath, values, {
                ['FixtureConnector__pollingEndpoint']: false,
                FixtureTriggerConfig: false,
            }),
            (error: unknown) => error instanceof ConnectorTriggerLocalSettingsChangedError
                && error.changedNames.join() === 'FixtureTriggerConfig'
                && error.currentExisting.FixtureTriggerConfig === true,
        );
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
    });

    test('does not overwrite an unsaved local-settings editor', async () => {
        const original = '{"IsEncrypted":false,"Values":{"Unrelated":"disk-value"}}';
        await fs.promises.writeFile(settingsPath, original);
        const document = await workspace.openTextDocument(Uri.file(settingsPath));
        const edit = new WorkspaceEdit();
        edit.insert(document.uri, new Position(0, 0), ' ');
        assert.strictEqual(await workspace.applyEdit(edit), true);
        const draft = document.getText();
        await assert.rejects(
            new FileConnectorTriggerLocalSettingsWriter().write(await createTestActionContext(), projectPath, values),
            /Save or resolve changes to local\.settings\.json/i,
        );
        assert.strictEqual(document.getText(), draft);
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
    });

    test('rejects encrypted settings without changing the existing file', async () => {
        const original = '{"IsEncrypted":true,"Values":{"Unrelated":"encrypted-fixture"}}';
        await fs.promises.writeFile(settingsPath, original);
        await assert.rejects(
            new FileConnectorTriggerLocalSettingsWriter().write(await createTestActionContext(), projectPath, values),
            /Decrypt local\.settings\.json/i,
        );
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
    });

    test('keeps conflicting environment overrides and disk settings unchanged', async () => {
        const key = 'FixtureTriggerConfig';
        const previous = process.env[key];
        const original = '{"IsEncrypted":false,"Values":{"Unrelated":"keep"}}';
        await fs.promises.writeFile(settingsPath, original);
        try {
            process.env[key] = 'environment-config';
            await assert.rejects(
                new FileConnectorTriggerLocalSettingsWriter().write(await createTestActionContext(), projectPath, values),
                /environment variable overrides/i,
            );
            assert.strictEqual(process.env[key], 'environment-config');
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
        } finally {
            if (previous === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous;
            }
        }
    });

    test('creates missing local settings without encryption and only the approved keys', async () => {
        await new FileConnectorTriggerLocalSettingsWriter().write(await createTestActionContext(), projectPath, values);
        assert.deepStrictEqual(await AzExtFsExtra.readJSON(settingsPath), { IsEncrypted: false, Values: values });
        assert.deepStrictEqual(await fs.promises.readdir(projectPath), ['local.settings.json']);
    });
});
