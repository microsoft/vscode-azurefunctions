/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { envUtils } from '../extension.bundle';

suite('envUtils', () => {
    test('isEnvironmentVariableSet', () => {
        const trueValues = [
            true,
            'true',
            1,
            '1',
            'tRue',
            'anyotherstring',
            2
        ];

        for (const val of trueValues) {
            assert.equal(envUtils.isEnvironmentVariableSet(val), true);
        }

        const falseValues = [
            undefined,
            null,
            '',
            false,
            'false',
            0,
            '0',
            'fAlse'
        ];

        for (const val of falseValues) {
            assert.equal(envUtils.isEnvironmentVariableSet(val), false);
        }
    });
});
