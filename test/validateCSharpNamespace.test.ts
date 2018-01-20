/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { validateCSharpNamespace } from '../src/commands/createFunction/CSharpFunctionCreator';

suite('validateCSharpNamespace', () => {
    test('Valid values', async () => {
        assert.equal(validateCSharpNamespace('Company.Function'), undefined);
        assert.equal(validateCSharpNamespace('Company_A.Function'), undefined);
        assert.equal(validateCSharpNamespace('a.b.c.d.e.f'), undefined);
        assert.equal(validateCSharpNamespace('a'), undefined);
        assert.equal(validateCSharpNamespace('_a'), undefined);
        assert.equal(validateCSharpNamespace('a9'), undefined);
    });

    test('Invalid - Extra period', () => {
        assert.notEqual(validateCSharpNamespace('a.'), undefined);
        assert.notEqual(validateCSharpNamespace('.a'), undefined);
        assert.notEqual(validateCSharpNamespace('.'), undefined);
    });

    test('Invalid - Keyword', () => {
        assert.notEqual(validateCSharpNamespace('abstract'), undefined);
        assert.notEqual(validateCSharpNamespace('a.namespace'), undefined);
    });

    test('Invalid - Disallowed characters', () => {
        // start character must be letter or '_'
        assert.notEqual(validateCSharpNamespace('9a'), undefined);
        assert.notEqual(validateCSharpNamespace('-a'), undefined);

        assert.notEqual(validateCSharpNamespace('Company.Funct*ion'), undefined);
        assert.notEqual(validateCSharpNamespace('Company.Funct)ion'), undefined);
        assert.notEqual(validateCSharpNamespace('Company.Funct😀ion'), undefined);
    });
});
