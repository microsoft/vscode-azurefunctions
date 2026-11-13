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
    type ConnectorTriggerProjectMetadata,
    type ConnectorTriggerProjectMetadataErrorCode,
} from '../../src/connectorTrigger/connectorTriggerProjectMetadata';
import { connectorTriggerProjectsSetting, ProjectLanguage } from '../../src/constants';
import { parseJson } from '../../src/utils/parseJson';
import { updateGlobalSetting, updateWorkspaceSetting } from '../../src/vsCodeConfig/settings';
import { getTestWorkspaceFolder } from '../global.test';
import { writeConnectorTriggerMetadataFile } from '../writeConnectorTriggerMetadataFile';

const settingKey = `azureFunctions.${connectorTriggerProjectsSetting}`;
const metadataFileName = 'azureFunctions.connectorTrigger.json';

suite('Connector trigger project metadata', () => {
    let projectPath: string;
    let workspaceFolder: string;
    let otherWorkspaceFolder: string;
    let workspaceChildRoot: string;

    suiteSetup(() => {
        workspaceFolder = getTestWorkspaceFolder();
        otherWorkspaceFolder = getTestWorkspaceFolder();
    });

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), 'azfunc-connector-metadata-'),
        );
        workspaceChildRoot = path.join(workspaceFolder, path.basename(projectPath));
    });

    teardown(async () => {
        await updateWorkspaceSetting(connectorTriggerProjectsSetting, undefined, workspaceFolder);
        await updateWorkspaceSetting(connectorTriggerProjectsSetting, undefined, otherWorkspaceFolder);
        await fs.promises.rm(metadataPath(workspaceFolder), { force: true });
        await fs.promises.rm(metadataPath(otherWorkspaceFolder), { force: true });
        await fs.promises.rm(workspaceChildRoot, { recursive: true, force: true });
        await AzExtFsExtra.deleteResource(
            projectPath,
            { recursive: true, useTrash: false },
        );
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
        await writeConnectorTriggerMetadataFile(projectPath, createMetadata());
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), incomplete);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(projectPath), createMetadata());
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

    test('keeps malformed legacy settings intact when writing project-local metadata', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        const invalid = `{ "${settingKey}": { ".": `;
        await fs.promises.writeFile(settingsPath, invalid);

        await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), 'InvalidJson');
        await writeConnectorTriggerMetadataFile(projectPath, createMetadata());
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), invalid);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(projectPath), createMetadata());
    });

    test('rejects invalid metadata maps rather than replacing them', async () => {
        for (const [index, projects] of [null, [], false, 'customer-choice-secret'].entries()) {
            const project = path.join(projectPath, `invalid-${index}`);
            await writeSettings(project, projects);
            const settingsPath = path.join(project, '.vscode', 'settings.json');
            const before = await fs.promises.readFile(settingsPath, 'utf8');
            await assertMetadataError(readConnectorTriggerProjectMetadata(project), 'InvalidSchema');
            await writeConnectorTriggerMetadataFile(project, createMetadata());
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), before);
            assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(project), createMetadata());
        }
    });

    test('isolates workspace-folder roots and subprojects and preserves other project records', async () => {
        const child = path.join(workspaceChildRoot, 'apps', 'project');
        const sibling = path.join(workspaceChildRoot, 'apps', 'other-project');
        const root = createMetadata();
        const childHandoff = createMetadata('act', 'TrigNewContact');
        const peer = createMetadata('office365', 'OnNewEmailV3');
        await updateWorkspaceSetting('projectLanguage', ProjectLanguage.TypeScript, workspaceFolder);

        await writeConnectorTriggerMetadataFile(workspaceFolder, root);
        assert.strictEqual(await readConnectorTriggerProjectMetadata(child), undefined);
        assert.strictEqual(await readConnectorTriggerProjectMetadata(otherWorkspaceFolder), undefined);
        await writeConnectorTriggerMetadataFile(child, childHandoff);
        await writeConnectorTriggerMetadataFile(otherWorkspaceFolder, peer);

        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(workspaceFolder), root);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), childHandoff);
        assert.strictEqual(await readConnectorTriggerProjectMetadata(sibling), undefined);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(otherWorkspaceFolder), peer);
        const values = await readSettings(workspaceFolder);
        assert.strictEqual(values['azureFunctions.projectLanguage'], ProjectLanguage.TypeScript);
        assert.strictEqual(values[settingKey], undefined);
        assert.deepStrictEqual(await readMetadata(workspaceFolder), root);
        assert.deepStrictEqual(await readMetadata(child), childHandoff);
    });

    test('preserves legacy workspace precedence until project-local metadata is written', async () => {
        const child = workspaceChildRoot;
        const previous = createMetadata();
        await updateWorkspaceSetting(connectorTriggerProjectsSetting, { [path.basename(child)]: previous }, workspaceFolder);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), previous);

        const local = createMetadata('act', 'TrigNewContact');
        await writeSettings(child, { '.': local });
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), previous);

        await updateWorkspaceSetting(connectorTriggerProjectsSetting, undefined, workspaceFolder);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), local);
        await updateWorkspaceSetting(connectorTriggerProjectsSetting, { [path.basename(child)]: previous }, workspaceFolder);

        const updated = createMetadata('office365', 'OnNewEmailV3');
        await writeConnectorTriggerMetadataFile(child, updated);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), updated);
        assert.deepStrictEqual(await readMetadata(child), updated);
        assert.deepStrictEqual(await readSettings(child), { [settingKey]: { '.': local } });
        assert.deepStrictEqual((await readSettings(workspaceFolder))[settingKey], { [path.basename(child)]: previous });
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
            await writeConnectorTriggerMetadataFile(workspaceFolder, selected);
            assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(workspaceFolder), selected);
            assert.deepStrictEqual(configuration.inspect(connectorTriggerProjectsSetting)?.globalValue, hints);
            assert.deepStrictEqual(configuration.inspect(connectorTriggerProjectsSetting)?.workspaceValue, hints);
        } finally {
            await updateGlobalSetting(connectorTriggerProjectsSetting, previous?.globalValue);
            await configuration.update(connectorTriggerProjectsSetting, previous?.workspaceValue, ConfigurationTarget.Workspace);
        }
    });

    test('does not overwrite an unsaved metadata editor', async () => {
        await writeConnectorTriggerMetadataFile(projectPath, createMetadata());
        const filePath = metadataPath(projectPath);
        const before = await fs.promises.readFile(filePath, 'utf8');
        const document = await workspace.openTextDocument(Uri.file(filePath));
        const edit = new WorkspaceEdit();
        edit.insert(document.uri, new Position(0, 0), '// Unsaved user edit.\n');
        assert.strictEqual(await workspace.applyEdit(edit), true);
        try {
            const draft = document.getText();
            await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), 'MetadataNotSaved');
            assert.strictEqual(document.getText(), draft);
            assert.strictEqual(await fs.promises.readFile(filePath, 'utf8'), before);
        } finally {
            await document.save();
        }
    });

    test('uses platform path equality without duplicating a Windows project record', async () => {
        if (process.platform !== 'win32') {
            return;
        }
        const child = path.join(workspaceChildRoot, 'MixedCaseProject');
        await writeConnectorTriggerMetadataFile(child, createMetadata());
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child.toUpperCase()), createMetadata());
    });

    test('rejects ambiguous legacy project aliases without changing settings', async () => {
        await writeSettings(projectPath, { '.': createMetadata(), './': createMetadata('act', 'TrigNewContact') });
        const before = await fs.promises.readFile(path.join(projectPath, '.vscode', 'settings.json'), 'utf8');
        await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), 'InvalidSchema');
        await writeConnectorTriggerMetadataFile(projectPath, createMetadata());
        assert.strictEqual(await fs.promises.readFile(path.join(projectPath, '.vscode', 'settings.json'), 'utf8'), before);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(projectPath), createMetadata());
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

    async function readMetadata(folderPath: string): Promise<ConnectorTriggerProjectMetadata> {
        return parseJson<ConnectorTriggerProjectMetadata>(await fs.promises.readFile(metadataPath(folderPath), 'utf8'));
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
            await writeSettings(projectPath, { '.': metadata });
            const error = await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), 'InvalidSchema');
            assert.doesNotMatch(error.message, /private-fixture-value/);
        }
    });

    test('does not replace invalid or newer project-local metadata', async () => {
        await writeSettings(projectPath, { '.': createMetadata('legacy', 'legacyOperation') });
        await AzExtFsExtra.ensureDir(path.dirname(metadataPath(projectPath)));
        for (const [contents, code] of [
            ['', 'InvalidJson'],
            ['{ "version":', 'InvalidJson'],
            [JSON.stringify({ ...createMetadata(), version: 2 }), 'UnsupportedVersion'],
            [JSON.stringify({ ...createMetadata(), parameters: { folder: 'private-fixture-value' } }), 'InvalidSchema'],
        ] satisfies [string, ConnectorTriggerProjectMetadataErrorCode][]) {
            await fs.promises.writeFile(metadataPath(projectPath), contents);
            const error = await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), code);
            assert.ok(!error.message.includes(projectPath));
            assert.ok(!error.message.includes('private-fixture-value'));
            assert.strictEqual(await fs.promises.readFile(metadataPath(projectPath), 'utf8'), contents);
        }
    });

    async function writeRawSettings(contents: string): Promise<void> {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        await AzExtFsExtra.writeFile(settingsPath, contents);
    }
});

function metadataPath(folderPath: string): string {
    return path.join(folderPath, '.vscode', metadataFileName);
}

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
