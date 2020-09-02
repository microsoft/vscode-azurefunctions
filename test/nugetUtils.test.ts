/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { nugetUtils } from '../extension.bundle';

suite('nugetUtils.tryGetMaxInRange', () => {
    interface ITestCase {
        range: string;
        expected?: string;
    }

    const versions: string[] = ['0.6.0', '1.0.0', '1.0.1', '1.1.0', '2.0.0-alpha', '2.1.0-beta', '2.0.0', '3.0.0'];

    const testCases: ITestCase[] = [
        // Ranges examples from https://github.com/NuGetArchive/NuGet.Versioning/blob/master/src/NuGet.Versioning/VersionRangeFactory.cs#L38
        { range: '1.0', expected: '3.0.0' }, // 1.0 ≤ x
        { range: '(,1.0]', expected: '1.0.0' }, // x <= 1.0
        { range: '(,1.0)', expected: '0.6.0' }, // x < 1.0
        { range: '[1.0]', expected: '1.0.0' }, // x === 1.0
        { range: '(1.0,)', expected: '3.0.0' }, // 1.0 < x
        { range: '(1.0, 2.0)', expected: '1.1.0' }, // 1.0 < x < 2.0
        { range: '[1.0, 2.0]', expected: '2.0.0' }, // 1.0 <= x <= 2.0
        // No matching range
        { range: '(1.0)', expected: undefined },
        { range: '(,0.6.0)', expected: undefined },
        { range: '(,0.5.0]', expected: undefined },
        { range: '(3.0.0,)', expected: undefined },
        { range: '[3.0.1,)', expected: undefined },
        { range: '(1.*, 2.0.0)', expected: undefined },
        // Some other cases
        { range: '[1.*, 2.0.0)', expected: '1.1.0' }, // default functions bundle range
        { range: '(1.0.*, 2)', expected: '1.1.0' },
        { range: '1.*', expected: '1.1.0' },
        { range: '[1.*,)', expected: '3.0.0' },
        { range: '[1,2)', expected: '1.1.0' },
        { range: '[1,3)', expected: '2.0.0' },
        { range: '(1.0.1,)', expected: '3.0.0' },
        { range: '(,1]', expected: '1.0.0' },
        { range: '2.0.0-alpha', expected: '3.0.0' }
    ];

    for (const testCase of testCases) {
        test(testCase.range, () => {
            assert.equal(nugetUtils.tryGetMaxInRange(testCase.range, versions), testCase.expected);
        });
    }

    const invalidRanges: string[] = ['', '[,', '[,)', '1', '(,1.*]', '<,1.0>', '1.0.0.0'];
    for (const invalidRange of invalidRanges) {
        test(invalidRange, () => {
            assert.throws(() => nugetUtils.tryGetMaxInRange(invalidRange, versions));
        });
    }
});
