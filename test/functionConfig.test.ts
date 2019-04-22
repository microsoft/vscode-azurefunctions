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
        assert.equal(config.triggerBinding, undefined);
        assert.equal(config.isHttpTrigger, false);
        assert.equal(config.isTimerTrigger, false);
    });

    test('undefined', () => {
        const config: FunctionConfig = new FunctionConfig(undefined);
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 0);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, undefined);
        assert.equal(config.isHttpTrigger, false);
        assert.equal(config.isTimerTrigger, false);
    });

    test('empty object', () => {
        const config: FunctionConfig = new FunctionConfig({});
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 0);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, undefined);
        assert.equal(config.isHttpTrigger, false);
        assert.equal(config.isTimerTrigger, false);
    });

    test('bindings is not array', () => {
        const config: FunctionConfig = new FunctionConfig({ bindings: 'test' });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 0);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, undefined);
        assert.equal(config.isHttpTrigger, false);
        assert.equal(config.isTimerTrigger, false);
    });

    test('disabled function', () => {
        const config: FunctionConfig = new FunctionConfig({
            disabled: true
        });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 0);
        assert.equal(config.disabled, true);
        assert.equal(config.triggerBinding, undefined);
        assert.equal(config.isHttpTrigger, false);
        assert.equal(config.isTimerTrigger, false);
    });

    test('trigger binding type is not http', () => {
        const triggerBinding: {} = {
            direction: 'in',
            type: 'testTrigger'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [triggerBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, false);
        assert.equal(config.isTimerTrigger, false);
    });

    test('http trigger', () => {
        const triggerBinding: {} = {
            direction: 'in',
            type: 'httpTrigger'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [triggerBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.isTimerTrigger, false);
    });

    test('http trigger weird casing', () => {
        const triggerBinding: {} = {
            direction: 'in',
            type: 'hTtpTrigGer'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [triggerBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.isTimerTrigger, false);
    });

    test('timer trigger', () => {
        const triggerBinding: {} = {
            direction: 'in',
            type: 'timerTrigger'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [triggerBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, false);
        assert.equal(config.isTimerTrigger, true);
    });

    test('timer trigger weird casing', () => {
        const triggerBinding: {} = {
            direction: 'in',
            type: 'TiMerTriggER'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [triggerBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, false);
        assert.equal(config.isTimerTrigger, true);
    });

    test('admin auth level', () => {
        const triggerBinding: {} = {
            direction: 'in',
            type: 'httpTrigger',
            authLevel: 'admin'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [triggerBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.admin);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.isTimerTrigger, false);
    });

    test('function auth level', () => {
        const triggerBinding: {} = {
            direction: 'in',
            type: 'httpTrigger',
            authLevel: 'function'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [triggerBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.function);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.isTimerTrigger, false);
    });

    test('anonymous auth level', () => {
        const triggerBinding: {} = {
            direction: 'in',
            type: 'httpTrigger',
            authLevel: 'anonymous'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [triggerBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.anonymous);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.isTimerTrigger, false);
    });

    test('unrecognized auth level', () => {
        const triggerBinding: {} = {
            direction: 'in',
            type: 'httpTrigger',
            authLevel: 'testAuthLevel'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [triggerBinding] });
        assert.throws(
            () => config.authLevel,
            (error: Error) => error.message.includes('Unrecognized') && error.message.includes('testAuthLevel')
        );
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.isTimerTrigger, false);
    });

    test('Multiple http bindings', () => {
        const triggerBinding: {} = {
            direction: 'in',
            type: 'httpTrigger',
            authLevel: 'admin'
        };
        const config: FunctionConfig = new FunctionConfig({
            bindings: [
                {
                    direction: 'out',
                    type: 'http',
                    authLevel: 'anonymous'
                },
                {
                    direction: 'in',
                    type: 'http',
                    authLevel: 'anonymous'
                },
                triggerBinding
            ]
        });
        // auth level from triggerBinding should be used
        assert.equal(config.authLevel, HttpAuthLevel.admin);
        assert.equal(config.bindings.length, 3);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.isTimerTrigger, false);
    });

    // This happens for C# functions
    test('generated function.json that doesn\'t have direction defined', () => {
        const triggerBinding: {} = {
            type: 'httpTrigger',
            authLevel: 'admin'
        };
        const config: FunctionConfig = new FunctionConfig({ bindings: [triggerBinding] });
        assert.equal(config.authLevel, HttpAuthLevel.admin);
        assert.equal(config.bindings.length, 1);
        assert.equal(config.disabled, false);
        assert.equal(config.triggerBinding, triggerBinding);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.isTimerTrigger, false);
    });
});
