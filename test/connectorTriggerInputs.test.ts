/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parseConnectorSwaggerInputs } from '../src/debug/connectorNamespace/connectorTriggerInputs';

suite('Connector Trigger Swagger inputs', () => {
    test('inherits required path and query parameters when an operation has no parameters', () => {
        const inputs = parseConnectorSwaggerInputs({
            parameters: {
                survey: { name: 'surveyId', in: 'path', type: 'string', required: true },
            },
            paths: {
                '/surveys/{surveyId}': {
                    parameters: [
                        { $ref: '#/parameters/survey' },
                        { name: 'page', in: 'query', type: 'integer', required: true },
                    ],
                    get: { operationId: 'FixtureEvent' },
                },
            },
        }, 'FixtureEvent');

        assert.deepStrictEqual(inputs?.map(input => [input.name, input.type, input.required]), [
            ['surveyId', 'string', true],
            ['page', 'integer', true],
        ]);
    });

    test('resolves parameter references before applying operation overrides by location and name', () => {
        const inputs = parseConnectorSwaggerInputs({
            parameters: {
                pathFilter: { name: 'filter', in: 'query', type: 'string', required: true, default: 'previous' },
                operationFilter: { name: 'filter', in: 'query', type: 'boolean', required: false, default: false },
            },
            paths: {
                '/fixture/{filter}': {
                    parameters: [
                        { $ref: '#/parameters/pathFilter' },
                        { name: 'filter', in: 'path', type: 'string', required: true },
                    ],
                    get: { operationId: 'FixtureEvent', parameters: [{ $ref: '#/parameters/operationFilter' }] },
                    post: { operationId: 'OtherEvent', parameters: [{ name: 'unrelated', in: 'query', type: 'string', required: true }] },
                },
            },
        }, 'FixtureEvent');

        assert.deepStrictEqual(inputs?.map(input => [input.name, input.type, input.required, input.defaultValue]), [
            ['filter', 'boolean', false, false],
            ['filter', 'string', true, undefined],
        ]);
    });

    test('applies hidden operation overrides before filtering and retains operation-only parameters', () => {
        const inputs = parseConnectorSwaggerInputs({
            paths: {
                '/fixture': {
                    parameters: [{ name: 'filter', in: 'query', type: 'string', required: true }],
                    get: {
                        operationId: 'FixtureEvent',
                        parameters: [
                            { name: 'filter', in: 'query', type: 'string', required: true, 'x-ms-visibility': 'internal' },
                            { name: 'page', in: 'query', type: 'integer', required: false },
                        ],
                    },
                },
            },
        }, 'FixtureEvent');

        assert.deepStrictEqual(inputs?.map(input => input.name), ['page']);
    });

    test('resolves escaped JSON pointers in parameters and nested body schemas', () => {
        const inputs = parseConnectorSwaggerInputs({
            parameters: {
                'body/parameter': { name: 'body', in: 'body', required: true, schema: { $ref: '#/definitions/body~1schema' } },
            },
            definitions: {
                'body/schema': {
                    type: 'object',
                    required: ['name'],
                    properties: { name: { $ref: '#/definitions/string~0value' } },
                },
                'string~value': { type: 'string' },
            },
            paths: {
                '/fixture': {
                    post: { operationId: 'FixtureEvent', parameters: [{ $ref: '#/parameters/body~1parameter' }] },
                },
            },
        }, 'FixtureEvent');

        assert.deepStrictEqual(inputs?.map(input => [input.name, input.type, input.required]), [['name', 'string', true]]);
    });

    test('keeps webhook event parameters without prompting for the notification URL', () => {
        const inputs = parseConnectorSwaggerInputs({
            paths: {
                '/subscribe': {
                    'x-ms-notification-content': { schema: { type: 'object' } },
                    post: {
                        operationId: 'WebhookEvent',
                        parameters: [
                            { name: 'callbackUrl', in: 'query', type: 'string', required: true, 'x-ms-notification-url': true },
                            { name: 'folder', in: 'query', type: 'string', required: true },
                        ],
                    },
                },
            },
        }, 'WebhookEvent');

        assert.deepStrictEqual(inputs?.map(input => [input.name, input.required]), [['folder', true]]);
    });
});
