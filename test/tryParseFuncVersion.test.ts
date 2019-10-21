/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FuncVersion, tryParseFuncVersion } from '../extension.bundle';

suite('tryParseFuncVersion', () => {
    const specificOne: string = '1.0.0';
    test(specificOne, () => {
        assert.equal(tryParseFuncVersion(specificOne), FuncVersion.v1);
    });

    const genericOne: string = '~1';
    test(genericOne, () => {
        assert.equal(tryParseFuncVersion(genericOne), FuncVersion.v1);
    });

    const specificTwo: string = '2.0.0';
    test(specificTwo, () => {
        assert.equal(tryParseFuncVersion(specificTwo), FuncVersion.v2);
    });

    const versionInCsprojFile: string = 'v2';
    test(versionInCsprojFile, () => {
        assert.equal(tryParseFuncVersion(versionInCsprojFile), FuncVersion.v2);
    });

    const genericTwo: string = '~2';
    test(genericTwo, () => {
        assert.equal(tryParseFuncVersion(genericTwo), FuncVersion.v2);
    });

    const specificThree: string = '3.0.0';
    test(specificThree, () => {
        assert.equal(tryParseFuncVersion(specificThree), FuncVersion.v3);
    });

    const prerelease: string = '3.0.0-alpha';
    test(prerelease, () => {
        assert.equal(tryParseFuncVersion(prerelease), FuncVersion.v3);
    });

    const genericThree: string = '~3';
    test(genericThree, () => {
        assert.equal(tryParseFuncVersion(genericThree), FuncVersion.v3);
    });

    const specificFour: string = '4.0.0';
    test(specificFour, () => {
        assert.equal(tryParseFuncVersion(specificFour), undefined);
    });

    const genericFour: string = '~4';
    test(genericFour, () => {
        assert.equal(tryParseFuncVersion(genericFour), undefined);
    });

    const beta: string = 'beta';
    test(beta, () => {
        assert.equal(tryParseFuncVersion(beta), undefined);
    });

    const latest: string = 'latest';
    test(latest, () => {
        assert.equal(tryParseFuncVersion(latest), undefined);
    });
});
