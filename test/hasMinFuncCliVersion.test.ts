/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-dev';
import * as assert from 'assert';
import { FuncVersion, hasMinFuncCliVersion } from '../extension.bundle';

suite('hasMinFuncCliVersion', () => {
    test('Smaller major version', async () => {
        const result: boolean = await hasMinFuncCliVersion(await createTestActionContext(), '2.0.3', FuncVersion.v1);
        assert.strictEqual(result, false);
    });

    test('Greater major version', async () => {
        const result: boolean = await hasMinFuncCliVersion(await createTestActionContext(), '2.0.3', FuncVersion.v3);
        assert.strictEqual(result, true);
    });

    test('Same major version, meets minimum', async () => {
        const result: boolean = await hasMinFuncCliVersion(await createTestActionContext(), '3.0.0', FuncVersion.v3);
        assert.strictEqual(result, true);
    });

    test('Same major version, doesn\'t meet minimum', async () => {
        const result: boolean = await hasMinFuncCliVersion(await createTestActionContext(), '4.9999.0', FuncVersion.v4);
        assert.strictEqual(result, false);
    });
});
