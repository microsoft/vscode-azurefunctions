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
import { isPathEqual } from '../../src/utils/fs';
import { parseJson } from '../../src/utils/parseJson';
import { updateGlobalSetting, updateWorkspaceSetting } from '../../src/vsCodeConfig/settings';
import { getTestWorkspaceFolder } from '../global.test';

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

    test('writes a project-local metadata file without changing settings or ignore rules', async () => {
        const metadata = createMetadata();

        await writeConnectorTriggerProjectMetadata(projectPath, metadata);

        assert.deepStrictEqual(
            await readConnectorTriggerProjectMetadata(projectPath),
            metadata,
        );
        assert.deepStrictEqual(
            await readMetadata(projectPath),
            metadata,
        );
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(projectPath, '.vscode', 'settings.json')), false);
        assert.strictEqual(await AzExtFsExtra.pathExists(path.join(projectPath, '.gitignore')), false);
    });

    test('preserves JSONC comments, BOM, unrelated settings, and existing ignore rules on retries', async () => {
        const gitignorePath = path.join(projectPath, '.gitignore');
        await fs.promises.writeFile(gitignorePath, 'node_modules/\r\n', 'utf8');
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        const settings = '\uFEFF{\r\n    // Keep this comment.\r\n    "editor.tabSize": 2,\r\n}\r\n';
        await fs.promises.writeFile(settingsPath, settings, 'utf8');

        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
        const firstWrite = await fs.promises.readFile(metadataPath(projectPath), 'utf8');
        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());

        assert.strictEqual(await fs.promises.readFile(gitignorePath, 'utf8'), 'node_modules/\r\n');
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), settings);
        assert.strictEqual(await fs.promises.readFile(metadataPath(projectPath), 'utf8'), firstWrite);
        assert.deepStrictEqual(await readMetadata(projectPath), createMetadata());
    });

    test('preserves metadata file comments, BOM, and line endings when the selection changes', async () => {
        await AzExtFsExtra.ensureDir(path.dirname(metadataPath(projectPath)));
        const contents = '\uFEFF{\r\n    // Keep this comment.\r\n    "version": 1,\r\n    "connectorId": "office365",\r\n    "operationId": "OnNewEmail"\r\n}\r\n';
        await fs.promises.writeFile(metadataPath(projectPath), contents, 'utf8');
        const updated = createMetadata('act', 'TrigNewContact');

        await writeConnectorTriggerProjectMetadata(projectPath, updated);

        const result = await fs.promises.readFile(metadataPath(projectPath), 'utf8');
        assert.ok(result.startsWith('\uFEFF'));
        assert.ok(result.includes('// Keep this comment.\r\n'));
        assert.ok(!result.replace(/\r\n/g, '').includes('\n'));
        assert.deepStrictEqual(await readMetadata(projectPath), updated);
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
                metadataPath(projectPath),
            ),
            false,
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
        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
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
        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
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
            await writeConnectorTriggerProjectMetadata(project, createMetadata());
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
        assert.strictEqual(values[settingKey], undefined);
        assert.deepStrictEqual(await readMetadata(workspaceFolder), root);
        assert.deepStrictEqual(await readMetadata(child), childHandoff);
    });

    test('prefers project-local identity and reads legacy parent records when it is absent', async () => {
        const child = workspaceChildRoot;
        const previous = createMetadata();
        await updateWorkspaceSetting(connectorTriggerProjectsSetting, { [path.basename(child)]: previous }, workspaceFolder);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), previous);

        const local = createMetadata('act', 'TrigNewContact');
        await writeSettings(child, { '.': local });
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), local);

        const updated = createMetadata('office365', 'OnNewEmailV3');
        await writeConnectorTriggerProjectMetadata(child, updated);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child), updated);
        assert.deepStrictEqual(await readMetadata(child), updated);
        assert.deepStrictEqual(await readSettings(child), { [settingKey]: { '.': local } });
        assert.deepStrictEqual((await readSettings(workspaceFolder))[settingKey], { [path.basename(child)]: previous });
    });

    test('retains both identities when subprojects are written concurrently', async () => {
        const first = path.join(workspaceChildRoot, 'first');
        const second = path.join(workspaceChildRoot, 'second');
        const firstMetadata = createMetadata();
        const secondMetadata = createMetadata('act', 'TrigNewContact');

        await Promise.all([
            writeConnectorTriggerProjectMetadata(first, firstMetadata),
            writeConnectorTriggerProjectMetadata(second, secondMetadata),
        ]);

        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(first), firstMetadata);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(second), secondMetadata);
        assert.deepStrictEqual(await readMetadata(first), firstMetadata);
        assert.deepStrictEqual(await readMetadata(second), secondMetadata);
    });

    test('serializes concurrent updates to the same project metadata file', async () => {
        const first = createMetadata();
        const second = createMetadata('act', 'TrigNewContact');
        const unrelated = createMetadata('rss', 'OnNewFeed');
        await writeSettings(projectPath, { 'other-project': unrelated });

        await Promise.all([
            writeConnectorTriggerProjectMetadata(projectPath, first),
            writeConnectorTriggerProjectMetadata(projectPath, second),
        ]);

        assert.deepStrictEqual(await readSettings(projectPath), { [settingKey]: { 'other-project': unrelated } });
        assert.deepStrictEqual(await readMetadata(projectPath), second);
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(projectPath), second);
    });

    test('preserves a settings save that occurs before the metadata update', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        const settingsDir = path.dirname(settingsPath);
        await AzExtFsExtra.ensureDir(settingsDir);
        await fs.promises.writeFile(settingsPath, '{ "editor.tabSize": 2 }');

        const originalEnsureDir = AzExtFsExtra.ensureDir;
        let savedConcurrently = false;
        AzExtFsExtra.ensureDir = async resource => {
            if (resource === settingsDir && !savedConcurrently) {
                savedConcurrently = true;
                await fs.promises.writeFile(settingsPath, '{ "editor.tabSize": 4 }');
            }
            await originalEnsureDir(resource);
        };
        try {
            await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
        } finally {
            AzExtFsExtra.ensureDir = originalEnsureDir;
        }

        assert.strictEqual(savedConcurrently, true);
        assert.deepStrictEqual(await readSettings(projectPath), { 'editor.tabSize': 4 });
        assert.deepStrictEqual(await readMetadata(projectPath), createMetadata());
    });

    test('preserves a settings file created while metadata is being written', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        const settingsDir = path.dirname(settingsPath);
        const originalEnsureDir = AzExtFsExtra.ensureDir;
        let createdConcurrently = false;
        AzExtFsExtra.ensureDir = async resource => {
            await originalEnsureDir(resource);
            if (resource === settingsDir && !createdConcurrently) {
                createdConcurrently = true;
                await fs.promises.writeFile(settingsPath, '{ "editor.tabSize": 4 }', { flag: 'wx' });
            }
        };
        try {
            await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
        } finally {
            AzExtFsExtra.ensureDir = originalEnsureDir;
        }

        assert.strictEqual(createdConcurrently, true);
        assert.deepStrictEqual(await readSettings(projectPath), { 'editor.tabSize': 4 });
        assert.deepStrictEqual(await readMetadata(projectPath), createMetadata());
    });

    test('preserves a VS Code settings save during the metadata commit', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        await fs.promises.writeFile(settingsPath, '{ "editor.tabSize": 2 }');
        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
        const document = await workspace.openTextDocument(Uri.file(settingsPath));
        const updated = createMetadata('act', 'TrigNewContact');
        let savedConcurrently = false;
        await duringMetadataCommit(projectPath, async () => {
            const edit = new WorkspaceEdit();
            edit.replace(document.uri, document.lineAt(0).range, '{ "editor.tabSize": 4 }');
            assert.strictEqual(await workspace.applyEdit(edit), true);
            assert.strictEqual(await document.save(), true);
            savedConcurrently = true;
        }, async () => {
            await writeConnectorTriggerProjectMetadata(projectPath, updated);
        });

        assert.strictEqual(savedConcurrently, true);
        assert.deepStrictEqual(await readSettings(projectPath), { 'editor.tabSize': 4 });
        assert.deepStrictEqual(await readMetadata(projectPath), updated);
    });

    test('preserves external settings saves with either VS Code conflict policy', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
        const configuration = workspace.getConfiguration('files');
        const previous = configuration.inspect<string>('saveConflictResolution')?.globalValue;
        try {
            for (const [index, policy] of ['askUser', 'overwriteFileOnDisk'].entries()) {
                await configuration.update('saveConflictResolution', policy, ConfigurationTarget.Global);
                await fs.promises.writeFile(settingsPath, '{ "editor.tabSize": 2 }');
                const externalContents = '{ "editor.tabSize": 4, "editor.wordWrap": "on" }';
                let savedConcurrently = false;
                await duringMetadataCommit(projectPath, async () => {
                    await fs.promises.writeFile(settingsPath, externalContents);
                    savedConcurrently = true;
                }, async () => {
                    await writeConnectorTriggerProjectMetadata(projectPath, createMetadata(`connector${index}`, `operation${index}`));
                });
                assert.strictEqual(savedConcurrently, true);
                assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), externalContents);
            }
        } finally {
            await configuration.update('saveConflictResolution', previous, ConfigurationTarget.Global);
        }
    });

    test('preserves a same-size settings save with unchanged file timestamps', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        await fs.promises.writeFile(settingsPath, '{ "editor.tabSize": 2 }');
        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
        const fixedTime = new Date('2020-01-02T03:04:05.000Z');
        await fs.promises.utimes(settingsPath, fixedTime, fixedTime);
        const initialStat = await fs.promises.stat(settingsPath);
        const externalContents = '{ "editor.tabSize": 4 }';
        let savedConcurrently = false;
        await duringMetadataCommit(projectPath, async () => {
            await fs.promises.writeFile(settingsPath, externalContents);
            await fs.promises.utimes(settingsPath, initialStat.atime, initialStat.mtime);
            savedConcurrently = true;
        }, async () => {
            await writeConnectorTriggerProjectMetadata(projectPath, createMetadata('act', 'TrigNewContact'));
        });

        const finalStat = await fs.promises.stat(settingsPath);
        assert.strictEqual(savedConcurrently, true);
        assert.strictEqual(finalStat.size, initialStat.size);
        assert.strictEqual(finalStat.mtimeMs, initialStat.mtimeMs);
        assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), externalContents);
    });

    test('rejects a concurrent change to the metadata file without replacing it', async () => {
        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
        const external = createMetadata('rss', 'OnNewFeed');
        const originalOpen = fs.promises.open;
        let changedConcurrently = false;
        fs.promises.open = async (...args) => {
            const file = await originalOpen(...args);
            if (typeof args[0] === 'string' && args[0].startsWith(`${metadataPath(projectPath)}.`)) {
                await fs.promises.writeFile(metadataPath(projectPath), JSON.stringify(external));
                changedConcurrently = true;
            }
            return file;
        };
        try {
            await assertMetadataError(
                writeConnectorTriggerProjectMetadata(projectPath, createMetadata('act', 'TrigNewContact')),
                'MetadataChanged',
            );
        } finally {
            fs.promises.open = originalOpen;
        }

        assert.strictEqual(changedConcurrently, true);
        assert.deepStrictEqual(await readMetadata(projectPath), external);
        assert.deepStrictEqual(await fs.promises.readdir(path.dirname(metadataPath(projectPath))), [metadataFileName]);
    });

    test('does not replace a metadata file created concurrently', async () => {
        const external = createMetadata('rss', 'OnNewFeed');
        const originalOpen = fs.promises.open;
        let createdConcurrently = false;
        fs.promises.open = async (...args) => {
            const file = await originalOpen(...args);
            if (typeof args[0] === 'string' && args[0].startsWith(`${metadataPath(projectPath)}.`)) {
                await fs.promises.writeFile(metadataPath(projectPath), JSON.stringify(external), { flag: 'wx' });
                createdConcurrently = true;
            }
            return file;
        };
        try {
            await assertMetadataError(
                writeConnectorTriggerProjectMetadata(projectPath, createMetadata()),
                'MetadataChanged',
            );
        } finally {
            fs.promises.open = originalOpen;
        }

        assert.strictEqual(createdConcurrently, true);
        assert.deepStrictEqual(await readMetadata(projectPath), external);
        assert.deepStrictEqual(await fs.promises.readdir(path.dirname(metadataPath(projectPath))), [metadataFileName]);
    });

    test('releases the write lock and removes temporary files after a failed write', async () => {
        const originalRename = fs.promises.rename;
        let failedOnce = false;
        fs.promises.rename = async (oldPath, newPath) => {
            if (typeof newPath === 'string' && isPathEqual(newPath, metadataPath(projectPath)) && !failedOnce) {
                failedOnce = true;
                throw new Error('Injected metadata write failure.');
            }
            await originalRename(oldPath, newPath);
        };
        try {
            const first = writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
            const second = writeConnectorTriggerProjectMetadata(projectPath, createMetadata('act', 'TrigNewContact'));
            await assertMetadataError(first, 'WriteFailed');
            await second;
        } finally {
            fs.promises.rename = originalRename;
        }

        assert.strictEqual(failedOnce, true);
        assert.deepStrictEqual(await readMetadata(projectPath), createMetadata('act', 'TrigNewContact'));
        assert.deepStrictEqual(await fs.promises.readdir(path.dirname(metadataPath(projectPath))), [metadataFileName]);
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

    test('does not disturb an unsaved settings editor', async () => {
        const settingsPath = path.join(projectPath, '.vscode', 'settings.json');
        await AzExtFsExtra.ensureDir(path.dirname(settingsPath));
        await fs.promises.writeFile(settingsPath, '{ "editor.tabSize": 2 }');
        const before = await fs.promises.readFile(settingsPath, 'utf8');
        const document = await workspace.openTextDocument(Uri.file(settingsPath));
        const edit = new WorkspaceEdit();
        edit.insert(document.uri, new Position(0, 0), '// Unsaved user edit.\n');
        assert.strictEqual(await workspace.applyEdit(edit), true);
        try {
            const draft = document.getText();
            await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
            assert.strictEqual(document.getText(), draft);
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), before);
            assert.deepStrictEqual(await readMetadata(projectPath), createMetadata());
        } finally {
            await document.save();
        }
    });

    test('does not overwrite an unsaved metadata editor', async () => {
        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
        const filePath = metadataPath(projectPath);
        const before = await fs.promises.readFile(filePath, 'utf8');
        const document = await workspace.openTextDocument(Uri.file(filePath));
        const edit = new WorkspaceEdit();
        edit.insert(document.uri, new Position(0, 0), '// Unsaved user edit.\n');
        assert.strictEqual(await workspace.applyEdit(edit), true);
        try {
            const draft = document.getText();
            await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), 'MetadataNotSaved');
            await assertMetadataError(
                writeConnectorTriggerProjectMetadata(projectPath, createMetadata('act', 'TrigNewContact')),
                'MetadataNotSaved',
            );
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
        await writeConnectorTriggerProjectMetadata(child, createMetadata());
        assert.deepStrictEqual(await readConnectorTriggerProjectMetadata(child.toUpperCase()), createMetadata());
        await writeConnectorTriggerProjectMetadata(child.toUpperCase(), createMetadata('act', 'TrigNewContact'));
        assert.deepStrictEqual(await readMetadata(child), createMetadata('act', 'TrigNewContact'));
        assert.deepStrictEqual(await fs.promises.readdir(path.dirname(metadataPath(child))), [metadataFileName]);
    });

    test('rejects ambiguous legacy project aliases without changing settings', async () => {
        await writeSettings(projectPath, { '.': createMetadata(), './': createMetadata('act', 'TrigNewContact') });
        const before = await fs.promises.readFile(path.join(projectPath, '.vscode', 'settings.json'), 'utf8');
        await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), 'InvalidSchema');
        await writeConnectorTriggerProjectMetadata(projectPath, createMetadata());
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

    async function duringMetadataCommit(
        folderPath: string,
        concurrentSave: () => Promise<void>,
        write: () => Promise<void>,
    ): Promise<void> {
        const originalRename = fs.promises.rename;
        fs.promises.rename = async (oldPath, newPath) => {
            if (typeof newPath === 'string' && isPathEqual(newPath, metadataPath(folderPath))) {
                await concurrentSave();
            }
            await originalRename(oldPath, newPath);
        };
        try {
            await write();
        } finally {
            fs.promises.rename = originalRename;
        }
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
            await assertMetadataError(readConnectorTriggerProjectMetadata(projectPath), code);
            const error = await assertMetadataError(
                writeConnectorTriggerProjectMetadata(projectPath, createMetadata('act', 'TrigNewContact')),
                code,
            );
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
