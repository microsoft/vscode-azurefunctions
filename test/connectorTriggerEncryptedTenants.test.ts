/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readEncryptedConnectorTenants } from '../src/debug/connectorNamespace/connectorTriggerEncryptedTenants';
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
