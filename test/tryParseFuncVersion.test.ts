/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FuncVersion, tryParseFuncVersion } from '../extension.bundle';

suite('tryParseFuncVersion', () => {
    const specificOne: string = '1.0.0';
    test(specificOne, () => {
        assert.strictEqual(tryParseFuncVersion(specificOne), FuncVersion.v1);
    });

    const genericOne: string = '~1';
    test(genericOne, () => {
        assert.strictEqual(tryParseFuncVersion(genericOne), FuncVersion.v1);
    });

    const specificTwo: string = '2.0.0';
    test(specificTwo, () => {
        assert.strictEqual(tryParseFuncVersion(specificTwo), FuncVersion.v2);
    });

    const versionInCsprojFile: string = 'v2';
    test(versionInCsprojFile, () => {
        assert.strictEqual(tryParseFuncVersion(versionInCsprojFile), FuncVersion.v2);
    });

    const genericTwo: string = '~2';
    test(genericTwo, () => {
        assert.strictEqual(tryParseFuncVersion(genericTwo), FuncVersion.v2);
    });

    const specificThree: string = '3.0.0';
    test(specificThree, () => {
        assert.strictEqual(tryParseFuncVersion(specificThree), FuncVersion.v3);
    });

    const prerelease: string = '3.0.0-alpha';
    test(prerelease, () => {
        assert.strictEqual(tryParseFuncVersion(prerelease), FuncVersion.v3);
    });

    const genericThree: string = '~3';
    test(genericThree, () => {
        assert.strictEqual(tryParseFuncVersion(genericThree), FuncVersion.v3);
    });

    const specificFour: string = '4.0.0';
    test(specificFour, () => {
        assert.strictEqual(tryParseFuncVersion(specificFour), undefined);
    });

    const genericFour: string = '~4';
    test(genericFour, () => {
        assert.strictEqual(tryParseFuncVersion(genericFour), undefined);
    });

    const beta: string = 'beta';
    test(beta, () => {
        assert.strictEqual(tryParseFuncVersion(beta), undefined);
    });

    const latest: string = 'latest';
    test(latest, () => {
        assert.strictEqual(tryParseFuncVersion(latest), undefined);
    });
});
