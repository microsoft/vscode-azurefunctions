/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FunctionConfig, HttpAuthLevel } from '../src/FunctionConfig';

// tslint:disable-next-line:max-func-body-length
suite('Function Config Tests', () => {
    test('Invalid triggers', () => {
        // no bindings
        assert.throws(
            () => new FunctionConfig({}),
            (error: Error) => error.message.includes('bindings')
        );

        // bindings is not array
        assert.throws(
            () => new FunctionConfig({ bindings: 'test' }),
            (error: Error) => error.message.includes('bindings')
        );

        // in binding does not have type
        assert.throws(
            () => new FunctionConfig({
                bindings: [{
                    direction: 'in'
                }]
            }),
            (error: Error) => error.message.includes('direction') && error.message.includes('in') && error.message.includes('type')
        );

        // unrecognized auth level
        assert.throws(
            () => new FunctionConfig({
                bindings: [{
                    direction: 'in',
                    type: 'httpTrigger',
                    authLevel: 'testAuthLevel'
                }]
            }),
            (error: Error) => error.message.includes('Unrecognized') && error.message.includes('testAuthLevel')
        );
    });

    test('Non http trigger', () => {
        let config: FunctionConfig = new FunctionConfig({
            bindings: [{
                direction: 'in',
                type: 'testType'
            }]
        });
        assert.equal(config.disabled, false); // default to false if not specified
        assert.equal(config.isHttpTrigger, false);

        // binding with disabled set to true and custom setting
        config = new FunctionConfig({
            disabled: true,
            bindings: [{
                direction: 'in',
                type: 'testType',
                testSetting: 'testValue'
            }]
        });
        assert.equal(config.disabled, true);
        assert.equal(config.isHttpTrigger, false);
        assert.equal(config.inBinding.testSetting, 'testValue');

        // no bindings (we can still get 'isHttpTrigger' and 'disabled', just not 'inBinding' information)
        config = new FunctionConfig({
            disabled: true,
            bindings: []
        });
        assert.equal(config.disabled, true);
        assert.equal(config.isHttpTrigger, false);
        assert.throws(
            () => config.inBinding,
            (error: Error) => error.message.includes('binding')
        );
        assert.throws(
            () => config.inBindingType,
            (error: Error) => error.message.includes('binding')
        );
    });

    test('Http trigger', () => {
        let config: FunctionConfig = new FunctionConfig({
            bindings: [{
                direction: 'in',
                type: 'httpTrigger'
            }]
        });
        assert.equal(config.disabled, false);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.authLevel, HttpAuthLevel.function); // default to function if not specified

        // validate 'admin' authLevel
        config = new FunctionConfig({
            bindings: [{
                direction: 'in',
                type: 'httpTrigger',
                authLevel: 'admin'
            }]
        });
        assert.equal(config.disabled, false);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.authLevel, HttpAuthLevel.admin);

        // validate 'anonymous' authLevel
        config = new FunctionConfig({
            bindings: [{
                direction: 'in',
                type: 'httpTrigger',
                authLevel: 'anonymous'
            }]
        });
        assert.equal(config.disabled, false);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.authLevel, HttpAuthLevel.anonymous);

        // validate 'function' authLevel and make sure 'in' binding is used
        config = new FunctionConfig({
            bindings: [{
                direction: 'out',
                type: 'httpTrigger',
                authLevel: 'anonymous'
            },
            {
                direction: 'in',
                type: 'httpTrigger',
                authLevel: 'function'
            }]
        });
        assert.equal(config.disabled, false);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.authLevel, HttpAuthLevel.function);

        // validate generated function.json that doesn't have 'in' binding
        config = new FunctionConfig({
            bindings: [{
                type: 'httpTrigger',
                authLevel: 'function'
            }]
        });
        assert.equal(config.disabled, false);
        assert.equal(config.isHttpTrigger, true);
        assert.equal(config.authLevel, HttpAuthLevel.function);
    });
});
