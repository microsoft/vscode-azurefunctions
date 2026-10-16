/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getWorkerPidFromJsonOutput, injectJsonOutputFileArgIfNeeded } from '../src/funcCoreTools/jsonOutputFile';

suite('JSON output file', () => {
    test('reads the latest worker PID from line-delimited JSON', async () => {
        const filePath = path.join(os.tmpdir(), `azfunc-json-output-${Date.now()}.json`);
        try {
            await AzExtFsExtra.writeFile(filePath, [
                JSON.stringify({ name: 'dotnet-worker-startup', workerProcessId: 123 }),
                JSON.stringify({ name: 'dotnet-worker-startup', workerProcessId: 456 }),
            ].join(os.EOL));

            assert.strictEqual(await getWorkerPidFromJsonOutput(filePath), 456);
        } finally {
            if (await AzExtFsExtra.pathExists(filePath)) {
                await AzExtFsExtra.deleteResource(filePath);
            }
        }
    });

    test('wraps the host task while injecting the output file argument', () => {
        const task = new vscode.Task(
            { type: 'func', command: 'host start' },
            vscode.TaskScope.Workspace,
            'func: host start',
            'func',
            new vscode.ShellExecution('func', ['host', 'start', '--dotnet-isolated-debug', '--enable-json-output']),
        );

        const result = injectJsonOutputFileArgIfNeeded(task);

        assert.notStrictEqual(result, task);
        assert.strictEqual(result.name, task.name);
        assert.strictEqual(result.scope, task.scope);
        const execution = result.execution as vscode.ShellExecution;
        const args = execution.args?.map(arg => typeof arg === 'string' ? arg : arg.value) ?? [];
        assert.ok(args.includes('--json-output-file'));
    });
});
