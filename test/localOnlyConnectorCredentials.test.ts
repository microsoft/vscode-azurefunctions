/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri } from 'vscode';
import { type TestApi } from '../src/testApi';
import { getTestApi } from './utils/testApiAccess';

suite('Connector Trigger local-only credential upload', () => {
    let projectPath: string;
    let uploadAppSettings: TestApi['commands']['uploadAppSettingsInternal'];

    suiteSetup(async () => {
        uploadAppSettings = (await getTestApi()).commands.uploadAppSettingsInternal;
    });

    setup(async () => {
        projectPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'connector-upload-'));
        await AzExtFsExtra.writeJSON(path.join(projectPath, 'host.json'), { version: '2.0' });
    });

    teardown(async () => {
        await AzExtFsExtra.deleteResource(projectPath, { recursive: true, useTrash: false });
    });

    for (const selection of ['VisualStudioCodeCredential', 'AzureCliCredential', 'EnvironmentCredential']) {
        test(`handles ${selection} without changing deployed managed identity or the local file`, async () => {
            const settingsPath = path.join(projectPath, 'local.settings.json');
            await AzExtFsExtra.writeJSON(settingsPath, {
                IsEncrypted: false,
                Values: {
                    AZURE_TOKEN_CREDENTIALS: selection,
                    Unrelated: 'fixture-value',
                    ['FixtureConnection__pollingEndpoint']: 'https://example.invalid',
                    ['FixtureConnection__tenantId']: selection === 'VisualStudioCodeCredential' ? 'local-tenant' : 'remote-mi-tenant',
                },
            });
            const original = await fs.promises.readFile(settingsPath, 'utf8');
            let uploaded: Awaited<ReturnType<Parameters<typeof uploadAppSettings>[1]['listApplicationSettings']>> | undefined;
            const client: Parameters<typeof uploadAppSettings>[1] = {
                fullName: 'fixture-app',
                listApplicationSettings: async () => ({
                    properties: {
                        ['FixtureConnection__credential']: 'managedidentity',
                        ['FixtureConnection__tenantId']: 'remote-mi-tenant',
                        Existing: 'remote-value',
                    },
                }),
                updateApplicationSettings: async settings => {
                    uploaded = settings;
                    return settings;
                },
            };

            await uploadAppSettings(await createTestActionContext(), client, {
                uri: Uri.file(projectPath), name: 'fixture-project', index: 0,
            });

            assert.deepStrictEqual(uploaded?.properties, {
                ['FixtureConnection__credential']: 'managedidentity',
                ['FixtureConnection__tenantId']: 'remote-mi-tenant',
                ['FixtureConnection__pollingEndpoint']: 'https://example.invalid',
                Existing: 'remote-value',
                Unrelated: 'fixture-value',
                ...(selection === 'VisualStudioCodeCredential' ? {} : { AZURE_TOKEN_CREDENTIALS: selection }),
            });
            assert.strictEqual(await fs.promises.readFile(settingsPath, 'utf8'), original);
        });
    }
});
