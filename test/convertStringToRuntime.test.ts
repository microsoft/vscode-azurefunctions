/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { convertStringToRuntime, ProjectRuntime } from '../extension.bundle';

suite('convertStringToRuntime', () => {
    const specificOne: string = '1.0.0';
    test(specificOne, () => {
        assert.equal(convertStringToRuntime(specificOne), ProjectRuntime.v1);
    });

    const genericOne: string = '~1';
    test(genericOne, () => {
        assert.equal(convertStringToRuntime(genericOne), ProjectRuntime.v1);
    });

    const specificTwo: string = '2.0.0';
    test(specificTwo, () => {
        assert.equal(convertStringToRuntime(specificTwo), ProjectRuntime.v2);
    });

    const genericTwo: string = '~2';
    test(genericTwo, () => {
        assert.equal(convertStringToRuntime(genericTwo), ProjectRuntime.v2);
    });

    const specificThree: string = '3.0.0';
    test(specificThree, () => {
        assert.equal(convertStringToRuntime(specificThree), undefined);
    });

    const genericThree: string = '~3';
    test(genericThree, () => {
        assert.equal(convertStringToRuntime(genericThree), undefined);
    });

    const beta: string = 'beta';
    test(beta, () => {
        assert.equal(convertStringToRuntime(beta), ProjectRuntime.v2);
    });

    const latest: string = 'latest';
    test(latest, () => {
        assert.equal(convertStringToRuntime(latest), undefined);
    });
});
