/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FunctionConfig, HttpAuthLevel } from '../extension.bundle';

// tslint:disable-next-line:max-func-body-length
suite('Function Config Tests', () => {
    test('null', () => {
        const config: FunctionConfig = new FunctionConfig(null);
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 0);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, undefined);
        assert.equal(config.isHttpTrigger, false);
    });

    test('undefined', () => {
        const config: FunctionConfig = new FunctionConfig(undefined);
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 0);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, undefined);
        assert.equal(config.isHttpTrigger, false);
    });

    test('empty object', () => {
        const config: FunctionConfig = new FunctionConfig({});
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 0);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, undefined);
        assert.equal(config.isHttpTrigger, false);
    });

    test('bindings is not array', () => {
        const config: FunctionConfig = new FunctionConfig({ bindings: 'test' });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 0);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, undefined);
        assert.equal(config.isHttpTrigger, false);
    });

    test('disabled function', () => {
        const config: FunctionConfig = new FunctionConfig({
            disabled: true
        });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 0);
        assert.equal(config.disabled, true);
        assert.equal(config.inBinding, undefined);
        assert.equal(config.isHttpTrigger, false);
    });

    test('in binding type is undefined', () => {
        const inBinding: {} = {
            direction: 'in'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [inBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, inBinding);
        assert.equal(config.isHttpTrigger, false);
    });

    test('in binding type is not http', () => {
        const inBinding: {} = {
            direction: 'in',
            type: 'testType'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [inBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, inBinding);
        assert.equal(config.isHttpTrigger, false);
    });

    test('http trigger', () => {
        const inBinding: {} = {
            direction: 'in',
            type: 'httpTrigger'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [inBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, inBinding);
        assert.equal(config.isHttpTrigger, true);
    });

    test('admin auth level', () => {
        const inBinding: {} = {
            direction: 'in',
            type: 'httpTrigger',
            authLevel: 'admin'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [inBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.admin);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, inBinding);
        assert.equal(config.isHttpTrigger, true);
    });

    test('function auth level', () => {
        const inBinding: {} = {
            direction: 'in',
            type: 'httpTrigger',
            authLevel: 'function'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [inBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, inBinding);
        assert.equal(config.isHttpTrigger, true);
    });

    test('anonymous auth level', () => {
        const inBinding: {} = {
            direction: 'in',
            type: 'httpTrigger',
            authLevel: 'anonymous'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [inBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.anonymous);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, inBinding);
        assert.equal(config.isHttpTrigger, true);
    });

    test('unrecognized auth level', () => {
        const inBinding: {} = {
            direction: 'in',
            type: 'httpTrigger',
            authLevel: 'testAuthLevel'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [inBinding] });
        assert.throws(
            () => config.authLevel,
            (error: Error) => error.message.includes('Unrecognized') && error.message.includes('testAuthLevel')
        );
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, inBinding);
        assert.equal(config.isHttpTrigger, true);
    });

    test('Multiple http bindings', () => {
        const inBinding: {} = {
            direction: 'in',
            type: 'httpTrigger',
            authLevel: 'admin'
        };
        const config: FunctionConfig = new FunctionConfig({
            bindings: [
                {
                    direction: 'out',
                    type: 'httpTrigger',
                    authLevel: 'anonymous'
                },
                inBinding
            ]
        });
        // auth level from 'in' inBinding should be used
        assert.equal(config.authLevel, HttpAuthLevel.admin);
        assert.equal(config.bindings.length, 2);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, inBinding);
        assert.equal(config.isHttpTrigger, true);
    });

    // This happens for C# functions
    test('generated function.json that doesn\'t have in binding', () => {
        const inBinding: {} = {
            type: 'httpTrigger',
            authLevel: 'admin'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [inBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.admin);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.inBinding, inBinding);
        assert.equal(config.isHttpTrigger, true);
    });
});
