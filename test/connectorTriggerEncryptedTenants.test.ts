/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readEncryptedConnectorTenants, readWithCoreTools } from '../src/debug/connectorNamespace/connectorTriggerEncryptedTenants';
import { getFuncCliPath } from '../src/funcCoreTools/getFuncCliPath';
import { cpUtils } from '../src/utils/cpUtils';

suite('Connector encrypted tenants', () => {
    test('reads only copied encrypted tenants and removes the temporary project', async () => {
        const context = await createTestActionContext();
        let directory = '';
        const result = await readEncryptedConnectorTenants(context, 'project', ['cipher1', 'cipher2'], {}, async (_context, _project, temp) => {
            directory = temp;
            const settings = JSON.parse(await fs.promises.readFile(path.join(temp, 'local.settings.json'), 'utf8')) as unknown;
            assert.deepStrictEqual(settings, { IsEncrypted: true, Values: { Tenant0: 'cipher1', Tenant1: 'cipher2' } });
            return 'App Settings:\n   -> Name: Tenant0\n      Value: first-tenant\n\n   -> Name: Tenant1\n      Value: second-tenant\n\nConnection Strings:\n';
        });
        assert.deepStrictEqual(result, ['first-tenant', 'second-tenant']);
        await assert.rejects(fs.promises.access(directory));
    });

    test('sanitizes command and malformed-output errors and removes temporary settings', async () => {
        const context = await createTestActionContext();
        for (const output of [undefined, '   -> Name: Tenant0\n      Value: private secret!\n']) {
            let directory = '';
            await assert.rejects(readEncryptedConnectorTenants(context, 'project', ['cipher'], {}, async (_context, _project, temp) => {
                directory = temp;
                if (output === undefined) {
                    throw new Error('private secret!');
                }
                return output;
            }), (error: unknown) => error instanceof Error && !error.message.includes('private secret') && !String(error.cause).includes('private secret'));
            await assert.rejects(fs.promises.access(directory));
        }
    });

    test('runs Core Tools from the project-relative path with the login-shell PATH in the temporary directory', async () => {
        const context = await createTestActionContext();
        const projectPath = path.join(os.tmpdir(), 'connector-project');
        const directory = path.join(os.tmpdir(), 'func-tenant-copy');
        const inherited = { PATH: '/usr/bin', Other: 'kept' };
        for (const [configured, expected] of [
            [path.join('node_modules', '.bin', 'func'), path.join(projectPath, 'node_modules', '.bin', 'func')],
            ['./tools/func', path.join(projectPath, 'tools', 'func')],
            ['func', 'func'],
            [path.join(os.tmpdir(), 'func'), path.join(os.tmpdir(), 'func')],
        ]) {
            const calls: unknown[] = [];
            const output = await readWithCoreTools(context, projectPath, directory, inherited, {
                getCliPath: async (_context, project) => { assert.strictEqual(project, projectPath); return configured; },
                getEnvironment: async (command, environment) => {
                    assert.strictEqual(command, expected);
                    assert.strictEqual(environment, inherited);
                    return { ...environment, PATH: '/usr/bin:/opt/homebrew/bin' };
                },
                execute: async (...args) => { calls.push(args); return { code: 0, cmdOutput: 'output' }; },
            });
            assert.strictEqual(output, 'output');
            assert.deepStrictEqual(calls, [[directory, expected, ['settings', 'list', '--showValue'], { PATH: '/usr/bin:/opt/homebrew/bin', Other: 'kept' }]]);
        }
    });

    test('runs a project-relative Core Tools shim from the temporary settings directory', async () => {
        const context = await createTestActionContext();
        const project = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'func-relative-cli-'));
        const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'func-tenant-copy-'));
        try {
            const bin = path.join(project, 'node_modules', '.bin');
            await fs.promises.mkdir(bin, { recursive: true });
            const isWindows = process.platform === 'win32';
            const shim = path.join(bin, isWindows ? 'func.cmd' : 'func');
            await fs.promises.writeFile(shim, isWindows ? '@echo shim-output\r\n' : '#!/bin/sh\necho shim-output\n', { mode: 0o755 });
            const relative = path.join('node_modules', '.bin', isWindows ? 'func.cmd' : 'func');
            const output = await readWithCoreTools(context, project, directory, { ...process.env }, {
                getCliPath: async () => relative,
                getEnvironment: async () => undefined,
                execute: async (cwd, command, args, environment) => await cpUtils.tryExecuteCommand(undefined, cwd, command, args, environment),
            });
            assert.match(output, /shim-output/);
        } finally {
            await fs.promises.rm(project, { recursive: true, force: true });
            await fs.promises.rm(directory, { recursive: true, force: true });
        }
    });

    test('reads a synthetic encrypted tenant using Core Tools', async function () {
        if (!process.env.FUNC_TEST_ENCRYPTED_TENANTS) {
            this.skip();
        }
        this.timeout(30000);
        const context = await createTestActionContext();
        const project = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'func-encryption-test-'));
        const settingsPath = path.join(project, 'local.settings.json');
        try {
            await fs.promises.writeFile(settingsPath, JSON.stringify({ IsEncrypted: false, Values: { tenant: 'fixture-tenant' } }));
            const cli = await getFuncCliPath(context, project);
            const encrypt = await cpUtils.tryExecuteCommand(undefined, project, cli, ['settings', 'encrypt']);
            assert.strictEqual(encrypt.code, 0, 'Core Tools could not encrypt the synthetic fixture');
            const before = await fs.promises.readFile(settingsPath, 'utf8');
            const settings = JSON.parse(before) as { IsEncrypted: boolean; Values: { tenant: string } };
            assert.strictEqual(settings.IsEncrypted, true);
            const tenants = await readEncryptedConnectorTenants(context, project, [settings.Values.tenant], process.env);
            assert.deepStrictEqual(tenants, ['fixture-tenant']);
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), before);
        } finally {
            await fs.promises.rm(project, { recursive: true, force: true });
        }
    });
});
