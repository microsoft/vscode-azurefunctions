/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { getPreLaunchTaskChain } from '../src/debug/getPreLaunchTaskChain';
import type { ITask } from '../src/vsCodeConfig/tasks';
import { getTestWorkspaceFolder } from './global.test';

suite('getPreLaunchTaskChain', () => {
    let workspaceFolder: vscode.WorkspaceFolder;

    suiteSetup(function (): void {
        const testPath = getTestWorkspaceFolder();
        const folders = vscode.workspace.workspaceFolders;
        const folder = folders?.find(f => f.uri.fsPath === testPath);
        if (!folder) {
            throw new Error(`Could not find workspace folder for path: ${testPath}`);
        }
        workspaceFolder = folder;
    });

    async function setTasks(tasks: ITask[]): Promise<void> {
        await vscode.workspace.getConfiguration('tasks', workspaceFolder.uri).update('tasks', tasks);
    }

    teardown(async () => {
        await vscode.workspace.getConfiguration('tasks', workspaceFolder.uri).update('tasks', undefined);
    });

    test('returns only the preLaunchTask when it has no dependencies', async () => {
        await setTasks([
            { type: 'shell', label: 'build', command: 'npm run build' }
        ]);
        const result = getPreLaunchTaskChain(workspaceFolder, 'build');
        assert.deepStrictEqual(result, ['build']);
    });

    test('returns empty array when preLaunchTask is not found in tasks list', async () => {
        await setTasks([]);
        const result = getPreLaunchTaskChain(workspaceFolder, 'nonexistent');
        assert.deepStrictEqual(result, []);
    });

    test('resolves a single string dependsOn', async () => {
        await setTasks([
            { type: 'shell', label: 'build', command: 'npm run build', dependsOn: 'compile' },
            { type: 'shell', label: 'compile', command: 'tsc' }
        ]);
        const result = getPreLaunchTaskChain(workspaceFolder, 'build');
        assert.deepStrictEqual(result, ['build', 'compile']);
    });

    test('resolves an array dependsOn', async () => {
        await setTasks([
            { type: 'shell', label: 'build', command: 'npm run build', dependsOn: ['compile', 'lint'] },
            { type: 'shell', label: 'compile', command: 'tsc' },
            { type: 'shell', label: 'lint', command: 'eslint .' }
        ]);
        const result = getPreLaunchTaskChain(workspaceFolder, 'build');
        assert.deepStrictEqual(result, ['build', 'compile', 'lint']);
    });

    test('resolves chained dependencies', async () => {
        await setTasks([
            { type: 'shell', label: 'build', dependsOn: 'compile' },
            { type: 'shell', label: 'compile', dependsOn: 'clean' },
            { type: 'shell', label: 'clean', command: 'rm -rf dist' }
        ]);
        const result = getPreLaunchTaskChain(workspaceFolder, 'build');
        assert.deepStrictEqual(result, ['build', 'compile', 'clean']);
    });

    test('handles circular dependencies without infinite loop', async () => {
        await setTasks([
            { type: 'shell', label: 'a', dependsOn: 'b' },
            { type: 'shell', label: 'b', dependsOn: 'a' }
        ]);
        const result = getPreLaunchTaskChain(workspaceFolder, 'a');
        assert.deepStrictEqual(result, ['a', 'b']);
    });

    test('excludes dependency names when they are not defined tasks', async () => {
        await setTasks([
            { type: 'shell', label: 'build', dependsOn: 'unknown-task' }
        ]);
        const result = getPreLaunchTaskChain(workspaceFolder, 'build');
        assert.deepStrictEqual(result, ['build']);
    });

    test('skips non-string values in dependsOn array', async () => {
        await setTasks([
            { type: 'shell', label: 'build', dependsOn: ['compile', 42, null, 'lint'] } as unknown as ITask,
            { type: 'shell', label: 'compile', command: 'tsc' },
            { type: 'shell', label: 'lint', command: 'eslint .' }
        ]);
        const result = getPreLaunchTaskChain(workspaceFolder, 'build');
        assert.deepStrictEqual(result, ['build', 'compile', 'lint']);
    });

    test('skips tasks without labels when building task map', async () => {
        await setTasks([
            { type: 'shell', label: 'build', dependsOn: 'compile' },
            { type: 'shell', command: 'tsc' } // no label - should not be in the task map
        ]);
        const result = getPreLaunchTaskChain(workspaceFolder, 'build');
        assert.deepStrictEqual(result, ['build']);
    });

    test('returns empty array for empty string preLaunchTask', async () => {
        await setTasks([]);
        const result = getPreLaunchTaskChain(workspaceFolder, '');
        assert.deepStrictEqual(result, []);
    });
});
