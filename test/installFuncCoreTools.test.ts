/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHttpHeaders, createPipelineRequest } from '@azure/core-rest-pipeline';
import { createTestActionContext, TestOutputChannel } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import * as assert from 'assert';
import { PackageManager } from '../src/constants';
import { ext } from '../src/extensionVariables';
import { installFuncCoreTools, lastCoreToolsInstallCommand } from '../src/funcCoreTools/installFuncCoreTools';
import { updateFuncCoreTools } from '../src/funcCoreTools/updateFuncCoreTools';
import { FuncVersion } from '../src/FuncVersion';
import { cpUtils } from '../src/utils/cpUtils';
import { requestUtils } from '../src/utils/requestUtils';

suite('Core Tools npm installation', () => {
    const originalExecuteCommand = cpUtils.executeCommand;
    const originalSendRequest = requestUtils.sendRequestWithExtTimeout;
    let originalOutputChannel: typeof ext.outputChannel;

    setup(() => {
        originalOutputChannel = ext.outputChannel;
        ext.outputChannel = new TestOutputChannel();
        requestUtils.sendRequestWithExtTimeout = async () => ({
            request: createPipelineRequest({ url: 'https://example.test/core-tools' }),
            status: 200,
            headers: createHttpHeaders(),
            parsedBody: { versions: { '3.0.0': {} }, 'dist-tags': { latest: '3.0.0' } }
        });
    });

    teardown(() => {
        cpUtils.executeCommand = originalExecuteCommand;
        requestUtils.sendRequestWithExtTimeout = originalSendRequest;
        ext.outputChannel = originalOutputChannel;
    });

    for (const operation of ['install', 'update'] as const) {
        test(`${operation} approves only the Core Tools package lifecycle scripts`, async () => {
            let calls = 0;
            cpUtils.executeCommand = async (output, cwd, command, args) => {
                calls++;
                assert.strictEqual(output, ext.outputChannel);
                assert.strictEqual(cwd, undefined);
                assert.strictEqual(command, 'npm');
                assert.deepStrictEqual(args, composeArgs(withArg(
                    'install', '-g', '--allow-scripts=azure-functions-core-tools', 'azure-functions-core-tools@3'
                ))());
                return '';
            };

            const context = await createTestActionContext();
            if (operation === 'install') {
                await installFuncCoreTools(context, [PackageManager.npm], FuncVersion.v3);
                assert.deepStrictEqual(lastCoreToolsInstallCommand, [
                    'npm', 'install', '-g', '--allow-scripts=azure-functions-core-tools', 'azure-functions-core-tools@3'
                ]);
            } else {
                await updateFuncCoreTools(context, PackageManager.npm, FuncVersion.v3);
            }
            assert.strictEqual(calls, 1);
        });
    }

    test('propagates npm installation failures', async () => {
        const failure = new Error('npm installation failed');
        cpUtils.executeCommand = async () => { throw failure; };
        await assert.rejects(installFuncCoreTools(await createTestActionContext(), [PackageManager.npm], FuncVersion.v3), error => error === failure);
    });
});
