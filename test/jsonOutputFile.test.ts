/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { dotnetIsolatedDebugFlag, enableJsonOutputFlag, jsonOutputFileFlag } from '../src/constants';
import { getJsonOutputFilePathFromTask, getWorkerPidFileArgs, getWorkerPidFilePath } from '../src/funcCoreTools/jsonOutputFile';
import { delay } from '../src/utils/delay';

const pidFile: string = '/tmp/azfunc-worker-pid-abc123.json';

suite('funcCoreTools/jsonOutputFile — getWorkerPidFileArgs', () => {
    test('points a dotnet-isolated debug task at a worker PID file', () => {
        const args: string[] = getWorkerPidFileArgs(['host', 'start', dotnetIsolatedDebugFlag, enableJsonOutputFlag], pidFile);
        assert.deepStrictEqual(args, [jsonOutputFileFlag, pidFile]);
    });

    test('leaves a task that opted out of --enable-json-output alone', () => {
        // The flag changes what func prints to the terminal, so a task that leaves it off is treated
        // as a deliberate choice rather than something to switch on for the user. Those tasks fall
        // back to the host status endpoint, which is what shipped before this change.
        assert.deepStrictEqual(getWorkerPidFileArgs(['host', 'start', dotnetIsolatedDebugFlag], pidFile), []);
    });

    test('leaves a task that is not dotnet-isolated debug untouched', () => {
        // Every language shares this task provider, so a Node/Python/Java `host start` has to come back
        // with no extra args at all.
        assert.deepStrictEqual(getWorkerPidFileArgs(['host', 'start'], pidFile), []);
        assert.deepStrictEqual(getWorkerPidFileArgs(['host', 'start', enableJsonOutputFlag], pidFile), []);
    });

    test('yields to an output file the user configured themselves', () => {
        const separateForm: string[] = [dotnetIsolatedDebugFlag, enableJsonOutputFlag, jsonOutputFileFlag, '/my/own.json'];
        assert.deepStrictEqual(getWorkerPidFileArgs(separateForm, pidFile), []);

        const combinedForm: string[] = [dotnetIsolatedDebugFlag, enableJsonOutputFlag, `${jsonOutputFileFlag}=/my/own.json`];
        assert.deepStrictEqual(getWorkerPidFileArgs(combinedForm, pidFile), []);
    });
});

suite('funcCoreTools/jsonOutputFile — getWorkerPidFilePath', () => {
    test('is stable across repeated resolutions of the same task', async () => {
        // VS Code can resolve the same task more than once. If the path moved between resolutions we
        // would delete one file and then poll a different one. The delay is what makes this catch a
        // path seeded with the clock, which is how the previous temp-file approach built its name.
        const key: string = '/repo|host start|--dotnet-isolated-debug';
        const first: string = await getWorkerPidFilePath(key);
        await delay(10);

        assert.strictEqual(await getWorkerPidFilePath(key), first);
    });

    test('differs per task so two projects debugging at once cannot collide', async () => {
        assert.notStrictEqual(
            await getWorkerPidFilePath('/repo/projectA|host start|'),
            await getWorkerPidFilePath('/repo/projectB|host start|'));
    });
});

suite('funcCoreTools/jsonOutputFile — producer/consumer contract', () => {
    test('the picker reads back the exact path the task provider injected', () => {
        // getWorkerPidFileArgs writes the flag (from FuncTaskProvider) and getJsonOutputFilePathFromTask
        // reads it back (from pickFuncProcess). They are two halves of one contract: if either side
        // changes the flag's shape, debugging silently degrades to scraping the terminal.
        const configuredArgs: string[] = ['host', 'start', dotnetIsolatedDebugFlag, enableJsonOutputFlag];
        const allArgs: string[] = [...configuredArgs, ...getWorkerPidFileArgs(configuredArgs, pidFile)];
        const task = new vscode.Task(
            { type: 'func', command: 'host start' },
            vscode.TaskScope.Workspace,
            'host start',
            'func',
            new vscode.ShellExecution('func', allArgs));

        assert.strictEqual(getJsonOutputFilePathFromTask(task), pidFile);
    });
});
