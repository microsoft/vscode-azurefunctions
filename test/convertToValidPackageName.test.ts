/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { convertToValidPackageName } from '../extension.bundle';

suite.only('convertToValidPackageName', () => {
    const testCases: [string, string, string][] = [
        ['Valid name', 'js1', 'js1'],
        ['Invalid casing', 'JS1', 'js1'],
        ['Invalid trailing/leading whitespace', ' js1 ', 'js1'],
        ['Invalid characters', 'js%$?1', 'js---1'],
        ['Invalid first character "."', '.js1', '-js1'],
        ['Invalid first character "_"', '_js1', '-js1'],
        ['Valid name where "." and "_" aren\'t first', 'js._1', 'js._1'],
    ];

    for (const [testCaseName, name, expected] of testCases) {
        test(testCaseName, () => {
            assert.equal(convertToValidPackageName(name), expected);
        });
    }
});
