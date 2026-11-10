/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigurationTarget, Position, Uri, WorkspaceEdit, workspace } from 'vscode';
import {
    ConnectorTriggerProjectMetadataError,
    connectorTriggerProjectMetadataVersion,
    readConnectorTriggerProjectMetadata,
    writeConnectorTriggerProjectMetadata,
    type ConnectorTriggerProjectMetadata,
    type ConnectorTriggerProjectMetadataErrorCode,
} from '../../src/connectorTrigger/connectorTriggerProjectMetadata';
import { connectorTriggerProjectsSetting, ProjectLanguage } from '../../src/constants';
import { parseJson } from '../../src/utils/parseJson';
import { updateGlobalSetting, updateWorkspaceSetting } from '../../src/vsCodeConfig/settings';
import { getTestWorkspaceFolder } from '../global.test';

const settingKey = `azureFunctions.${connectorTriggerProjectsSetting}`;

suite('Connector trigger project metadata', () => {
    let projectPath: string;
    let workspaceFolder: string;
    let otherWorkspaceFolder: string;

    suiteSetup(() => {
        workspaceFolder = getTestWorkspaceFolder();
        otherWorkspaceFolder = getTestWorkspaceFolder();
    });

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), 'azfunc-connector-metadata-'),
        );
    });

    teardown(async () => {
        await updateWorkspaceSetting(connectorTriggerProjectsSetting, undefined, workspaceFolder);
        await updateWorkspaceSetting(connectorTriggerProjectsSetting, undefined, otherWorkspaceFolder);
        await AzExtFsExtra.deleteResource(
            projectPath,
            { recursive: true, useTrash: false },
        );
    });

    test('writes a VS Code folder setting without a standalone artifact or ignore rule', async () => {
        const metadata = createMetadata();

        await writeConnectorTriggerProjectMetadata(projectPath, metadata);

        assert.deepStrictEqual(
            await readConnectorTriggerProjectMetadata(projectPath),
            metadata,
        );
        assert.deepStrictEqual(
            await readSettings(projectPath),
            { [settingKey]: { '.': metadata } },
        );
        await assertNoLegacyArtifact(projectPath);
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(projectPath, '.gitignore')), false);
    });

    test('preserves JSONC comments, BOM, unrelated settings, and existing ignore rules on retries', async () => {
        const gitignorePath = path.join(projectPath, '.gitignore');
        await fs.promises.writeFile(gitignorePath, 'node_modules/\r\n', 'utf8');
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        await fs.promises.writeFile(settingsPath, '\uFEFF{\r\n    // Keep this comment.\r\n    "editor.tabSize": 2,\r\n}\r\n', 'utf8');

        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
        const firstWrite = await fs.promises.readFile(settingsPath, 'utf8');
        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());

        assert.strictEqual(await fs.promises.readFile(gitignorePath, 'utf8'), 'node_modules/\r\n');
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), firstWrite);
        assert.ok(firstWrite.startsWith('\uFEFF'));
        assert.ok(firstWrite.includes('// Keep this comment.\r\n'));
        assert.deepStrictEqual(await readSettings(projectPath), {
            'editor.tabSize': 2,
            [settingKey]: { '.': createMetadata() },
        });
        await assertNoLegacyArtifact(projectPath);
    });

    test('does not persist trigger parameters or other unrecognized fields', async () => {
        const unsafeHandoff = {
            ...createMetadata(),
            parameters: {
                folder: 'customer-folder',
                secret: 'customer-secret',
            },
        } as ConnectorTriggerProjectMetadata;

        await assertMetadataError(
            writeConnectorTriggerProjectMetadata(projectPath, unsafeHandoff),
            'InvalidSchema',
        );
        assert.strictEqual(
            await AzExtFsExtra.pathExists(
                path.join(projectPath, '.vscode', 'settings.json'),
            ),
            false,
        );
        await assertNoLegacyArtifact(projectPath);
    });

    test('returns undefined without creating files when project metadata is absent', async () => {
        assert.strictEqual(
            await readConnectorTriggerProjectMetadata(projectPath),
            undefined,
        );
        assert.deepStrictEqual(await fs.promises.readdir(projectPath), []);
    });

    test('does not make unrelated incomplete editor settings block projects without connector metadata', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        const incomplete = '{ "editor.tabSize": ';
        await fs.promises.writeFile(settingsPath, incomplete);

        assert.strictEqual(await readConnectorTriggerProjectMetadata(projectPath), undefined);
        await assertMetadataError(writeConnectorTriggerProjectMetadata(projectPath, createMetadata()), 'InvalidJson');
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), incomplete);
    });

    test('rejects invalid selected VS Code records without disclosing their values', async () => {
        for (const [value, code] of [
            [null, 'InvalidSchema'],
            [{ ...createMetadata(), version: 2 }, 'UnsupportedVersion'],
            [{ ...createMetadata(), parameters: { folder: 'customer-choice-secret' } }, 'InvalidSchema'],
        ] satisfies [unknown, ConnectorTriggerProjectMetadataErrorCode][]) {
            await writeSettings(projectPath, { '.': value });
            const error = await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), code);
            assert.ok(!error.message.includes(projectPath));
            assert.ok(!error.message.includes('customer-choice-secret'));
        }
    });

    test('keeps malformed VS Code settings intact and does not fall back or overwrite them', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        const invalid = `{ "${settingKey}": { ".": `;
        await fs.promises.writeFile(settingsPath, invalid);

        await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), 'InvalidJson');
        await assertMetadataError(writeConnectorTriggerProjectMetadata(projectPath, createMetadata()), 'InvalidJson');
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), invalid);
    });

    test('rejects invalid metadata maps rather than replacing them', async () => {
        for (const projects of [null, [], false, 'customer-choice-secret']) {
            await writeSettings(projectPath, projects);
            const before = await fs.promises.readFile(path.join(projectPath, '.vscode', 'settings.json'), 'utf8');
            await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), 'InvalidSchema');
            await assertMetadataError(writeConnectorTriggerProjectMetadata(projectPath, createMetadata()), 'InvalidSchema');
            assert.strictEqual(await fs.promises.readFile(path.join(projectPath, '.vscode', 'settings.json'), 'utf8'), before);
        }
    });

    test('isolates workspace-folder roots and subprojects and preserves other project records', async () => {
        const child = path.join(workspaceFolder, 'apps', path.basename(projectPath));
        const sibling = path.join(workspaceFolder, 'apps', 'other-project');
        const root = createMetadata();
        const childHandoff = createMetadata('act', 'TrigNewContact');
        const peer = createMetadata('office365', 'OnNewEmailV3');
        await updateWorkspaceSetting('projectLanguage', ProjectLanguage.TypeScript, workspaceFolder);

        await writeConnectorTriggerProjectMetadata(workspaceFolder, root);
        assert.strictEqual(await readConnectorTriggerProjectMetadata(child), undefined);
        assert.strictEqual(await readConnectorTriggerProjectMetadata(otherWorkspaceFolder), undefined);
        await writeConnectorTriggerProjectMetadata(child, childHandoff);
        await writeConnectorTriggerProjectMetadata(otherWorkspaceFolder, peer);

        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(workspaceFolder), root);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), childHandoff);
        assert.strictEqual(await readConnectorTriggerProjectMetadata(sibling), undefined);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(otherWorkspaceFolder), peer);
        const values = await readSettings(workspaceFolder);
        assert.strictEqual(values['azureFunctions.projectLanguage'], ProjectLanguage.TypeScript);
        assert.deepStrictEqual(values[settingKey], {
            '.': root,
            [`apps/${path.basename(projectPath)}`]: childHandoff,
        });
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(child, '.vscode')), false);
        await assertNoLegacyArtifact(child);
    });

    test('uses the setting of a previously unopened project under a new parent workspace', async () => {
        const child = path.join(workspaceFolder, path.basename(projectPath));
        const previous = createMetadata();
        await writeSettings(child, { '.': previous });
        await writeConnectorTriggerProjectMetadata(workspaceFolder, createMetadata('act', 'TrigNewContact'));
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), previous);

        const updated = createMetadata('office365', 'OnNewEmailV3');
        await writeConnectorTriggerProjectMetadata(child, updated);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), updated);
        assert.deepStrictEqual(await readSettings(child), { [settingKey]: { '.': previous } });
        await assertNoLegacyArtifact(child);
    });

    test('does not inherit project identities from User or shared workspace settings', async () => {
        const configuration = workspace.getConfiguration('azureFunctions');
        const previous = configuration.inspect<unknown>(connectorTriggerProjectsSetting);
        const hints = { '.': createMetadata() };
        try {
            await updateGlobalSetting(connectorTriggerProjectsSetting, hints);
            await configuration.update(connectorTriggerProjectsSetting, hints, ConfigurationTarget.Workspace);

            assert.strictEqual(await readConnectorTriggerProjectMetadata(workspaceFolder), undefined);
            assert.strictEqual(await readConnectorTriggerProjectMetadata(otherWorkspaceFolder), undefined);
            assert.strictEqual(await readConnectorTriggerProjectMetadata(projectPath), undefined);

            const selected = createMetadata('act', 'TrigNewContact');
            await writeConnectorTriggerProjectMetadata(workspaceFolder, selected);
            assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(workspaceFolder), selected);
            assert.deepStrictEqual(configuration.inspect(connectorTriggerProjectsSetting)?.globalValue, hints);
            assert.deepStrictEqual(configuration.inspect(connectorTriggerProjectsSetting)?.workspaceValue, hints);
        } finally {
            await updateGlobalSetting(connectorTriggerProjectsSetting, previous?.globalValue);
            await configuration.update(connectorTriggerProjectsSetting, previous?.workspaceValue, ConfigurationTarget.Workspace);
        }
    });

    test('does not overwrite an unsaved settings editor', async () => {
        await writeConnectorTriggerProjectMetadata(workspaceFolder, createMetadata());
        const settingsPath = path.join(workspaceFolder, '.vscode', 'settings.json');
        const before = await fs.promises.readFile(settingsPath, 'utf8');
        const document = await workspace.openTextDocument(Uri.file(settingsPath));
        const edit = new WorkspaceEdit();
        edit.insert(document.uri, new Position(0, 0), '// Unsaved user edit.\n');
        assert.strictEqual(await workspace.applyEdit(edit), true);
        try {
            const draft = document.getText();
            await assertMetadataError(
                writeConnectorTriggerProjectMetadata(workspaceFolder, createMetadata('act', 'TrigNewContact')),
                'SettingsNotSaved',
            );
            assert.strictEqual(document.getText(), draft);
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), before);
        } finally {
            await document.save();
        }
    });

    test('uses platform path equality without duplicating a Windows project record', async () => {
        if (process.platform !== 'win32') {
            return;
        }
        const child = path.join(workspaceFolder, 'MixedCaseProject');
        await writeConnectorTriggerProjectMetadata(child, createMetadata());
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child.toUpperCase()), createMetadata());
        await writeConnectorTriggerProjectMetadata(child.toUpperCase(), createMetadata('act', 'TrigNewContact'));
        assert.deepStrictEqual((await readSettings(workspaceFolder))[settingKey], {
            MixedCaseProject: createMetadata('act', 'TrigNewContact'),
        });
    });

    test('fails explicitly on ambiguous project path aliases', async () => {
        await writeSettings(projectPath, { '.': createMetadata(), './': createMetadata('act', 'TrigNewContact') });
        await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), 'InvalidSchema');
        await assertMetadataError(writeConnectorTriggerProjectMetadata(projectPath, createMetadata()), 'InvalidSchema');
    });

    test('fails explicitly on invalid JSON without disclosing the path', async () => {
        await writeRawSettings(`{ "${settingKey}": { ".":`);

        const error = await assertMetadataError(
            readConnectorTriggerProjectMetadata(projectPath),
            'InvalidJson',
        );
        assert.ok(!error.message.includes(projectPath));
    });

    async function writeSettings(folderPath: string, projects: unknown): Promise<void> {
        const settingsPath = path.join(folderPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        await fs.promises.writeFile(settingsPath, JSON.stringify({ [settingKey]: projects }, undefined, 4));
    }

    async function readSettings(folderPath: string): Promise<Record<string, unknown>> {
        return parseJson<Record<string, unknown>>(await fs.promises.readFile(
            path.join(folderPath, '.vscode', 'settings.json'), 'utf8',
        ));
    }

    async function assertNoLegacyArtifact(folderPath: string): Promise<void> {
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(folderPath, '.azurefunctions')), false);
    }

    test('fails explicitly on unsupported versions and schema changes', async () => {
        await writeSettings(projectPath, {
            '.': { ...createMetadata(), version: connectorTriggerProjectMetadataVersion + 1 },
        });
        await assertMetadataError(
            readConnectorTriggerProjectMetadata(projectPath),
            'UnsupportedVersion',
        );

        await writeSettings(projectPath, {
            '.': { ...createMetadata(), connectionParameters: {} },
        });
        await assertMetadataError(
            readConnectorTriggerProjectMetadata(projectPath),
            'InvalidSchema',
        );
    });

    test('never accepts provisioning scope or parameter values in persisted project metadata', async () => {
        for (const field of ['subscription', 'tenantId', 'environment', 'region', 'location', 'parameters']) {
            const metadata = { ...createMetadata(), [field]: 'private-fixture-value' };
            const error = await assertMetadataError(
                writeConnectorTriggerProjectMetadata(projectPath, metadata), 'InvalidSchema',
            );
            assert.doesNotMatch(error.message, /private-fixture-value/);
            await writeSettings(projectPath, { '.': metadata });
            await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), 'InvalidSchema');
        }
    });

    async function writeRawSettings(contents: string): Promise<void> {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        await AzExtFsExtra.writeFile(settingsPath, contents);
    }
});

function createMetadata(
    connectorId = 'office365',
    operationId = 'OnNewEmail',
): ConnectorTriggerProjectMetadata {
    return {
        version: connectorTriggerProjectMetadataVersion,
        connectorId,
        operationId,
    };
}

async function assertMetadataError(
    promise: Promise<unknown>,
    code: ConnectorTriggerProjectMetadataErrorCode,
): Promise<ConnectorTriggerProjectMetadataError> {
    try {
        await promise;
    } catch (error) {
        assert.ok(error instanceof ConnectorTriggerProjectMetadataError);
        assert.strictEqual(error.code, code);
        return error;
    }

    assert.fail(`Expected ConnectorTriggerProjectMetadataError with code "${code}".`);
}
