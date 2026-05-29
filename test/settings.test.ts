/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectLanguage } from '../src/constants';
import { getFuncWatchProblemMatcher, getRootFunctionsWorkerRuntime, isKnownWorkerRuntime } from '../src/vsCodeConfig/settings';

suite('vsCodeConfig/settings — Go support', () => {
    test('getRootFunctionsWorkerRuntime: Go maps to native (not golang)', () => {
        assert.strictEqual(getRootFunctionsWorkerRuntime(ProjectLanguage.Go), 'native');
    });

    test('isKnownWorkerRuntime: accepts native', () => {
        assert.strictEqual(isKnownWorkerRuntime('native'), true);
    });

    test('getFuncWatchProblemMatcher: Go uses $func-golang-watch (user-friendly name, despite native worker runtime)', () => {
        assert.strictEqual(getFuncWatchProblemMatcher(ProjectLanguage.Go), '$func-golang-watch');
    });
});
