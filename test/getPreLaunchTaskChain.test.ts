/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getPreLaunchTaskChain } from '../src/debug/getPreLaunchTaskChain';
import type { ITask } from '../src/vsCodeConfig/tasks';

suite('getPreLaunchTaskChain', () => {
    test('returns only the preLaunchTask when it has no dependencies', () => {
        const tasks: ITask[] = [
            { type: 'shell', label: 'build', command: 'npm run build' }
        ];
        const result = getPreLaunchTaskChain(tasks, 'build');
        assert.deepStrictEqual(result, ['build']);
    });

    test('returns empty array when preLaunchTask is not found in tasks list', () => {
        const result = getPreLaunchTaskChain([], 'nonexistent');
        assert.deepStrictEqual(result, []);
    });

    test('resolves a single string dependsOn', () => {
        const tasks: ITask[] = [
            { type: 'shell', label: 'build', command: 'npm run build', dependsOn: 'compile' },
            { type: 'shell', label: 'compile', command: 'tsc' }
        ];
        const result = getPreLaunchTaskChain(tasks, 'build');
        assert.deepStrictEqual(result, ['build', 'compile']);
    });

    test('resolves an array dependsOn', () => {
        const tasks: ITask[] = [
            { type: 'shell', label: 'build', command: 'npm run build', dependsOn: ['compile', 'lint'] },
            { type: 'shell', label: 'compile', command: 'tsc' },
            { type: 'shell', label: 'lint', command: 'eslint .' }
        ];
        const result = getPreLaunchTaskChain(tasks, 'build');
        assert.deepStrictEqual(result, ['build', 'compile', 'lint']);
    });

    test('resolves chained dependencies', () => {
        const tasks: ITask[] = [
            { type: 'shell', label: 'build', dependsOn: 'compile' },
            { type: 'shell', label: 'compile', dependsOn: 'clean' },
            { type: 'shell', label: 'clean', command: 'rm -rf dist' }
        ];
        const result = getPreLaunchTaskChain(tasks, 'build');
        assert.deepStrictEqual(result, ['build', 'compile', 'clean']);
    });

    test('handles circular dependencies without infinite loop', () => {
        const tasks: ITask[] = [
            { type: 'shell', label: 'a', dependsOn: 'b' },
            { type: 'shell', label: 'b', dependsOn: 'a' }
        ];
        const result = getPreLaunchTaskChain(tasks, 'a');
        assert.deepStrictEqual(result, ['a', 'b']);
    });

    test('excludes dependency names when they are not defined tasks', () => {
        const tasks: ITask[] = [
            { type: 'shell', label: 'build', dependsOn: 'unknown-task' }
        ];
        const result = getPreLaunchTaskChain(tasks, 'build');
        assert.deepStrictEqual(result, ['build']);
    });

    test('skips non-string values in dependsOn array', () => {
        const tasks: ITask[] = [
            { type: 'shell', label: 'build', dependsOn: ['compile', 42, null, 'lint'] } as unknown as ITask,
            { type: 'shell', label: 'compile', command: 'tsc' },
            { type: 'shell', label: 'lint', command: 'eslint .' }
        ];
        const result = getPreLaunchTaskChain(tasks, 'build');
        assert.deepStrictEqual(result, ['build', 'compile', 'lint']);
    });

    test('skips tasks without labels when building task map', () => {
        const tasks: ITask[] = [
            { type: 'shell', label: 'build', dependsOn: 'compile' },
            { type: 'shell', command: 'tsc' } // no label - should not be in the task map
        ];
        const result = getPreLaunchTaskChain(tasks, 'build');
        assert.deepStrictEqual(result, ['build']);
    });

    test('returns empty array for empty string preLaunchTask', () => {
        const result = getPreLaunchTaskChain([], '');
        assert.deepStrictEqual(result, []);
    });
});
