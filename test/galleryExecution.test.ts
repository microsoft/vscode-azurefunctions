/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHttpHeaders, createPipelineRequest } from '@azure/core-rest-pipeline';
import { runWithTestActionContext, testGlobalSetup } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { executeFunctionWithInput } from '../src/commands/executeFunction/executeFunction';
import { FuncVersion } from '../src/FuncVersion';
import { ParsedFunctionJson } from '../src/funcConfig/function';
import { FunctionBase } from '../src/tree/FunctionBase';
import { type IProjectTreeItem } from '../src/tree/IProjectTreeItem';
import { ProjectSource } from '../src/tree/projectContextValues';
import { requestUtils } from '../src/utils/requestUtils';

const project: IProjectTreeItem = {
    source: ProjectSource.Local,
    getHostRequest: async () => ({ url: 'https://localhost:7071', rejectUnauthorized: false }),
    getHostJson: async () => ({ routePrefix: 'custom' }),
    getVersion: async () => FuncVersion.v4,
    getApplicationSettings: async () => ({}),
    setApplicationSetting: async () => undefined
};

class TestFunction extends FunctionBase {
    public async getKey(): Promise<string> {
        return 'test-key';
    }
}

suite('Gallery execution regressions', () => {
    suiteSetup(() => testGlobalSetup());

    for (const [methods, expected] of [
        [['get'], 'GET'],
        [['post'], 'POST'],
        [['get', 'post'], 'POST'],
        [['put', 'get'], 'PUT'],
        [['head'], 'HEAD'],
        [[], 'POST'],
        [undefined, 'POST'],
        [['invalid', 42], 'POST']
    ] as const) {
        test(`HTTP methods ${JSON.stringify(methods)} use ${expected}`, async () => {
            await runWithTestActionContext('testExecute', async context => {
                const config = new ParsedFunctionJson({ bindings: [{ type: 'httpTrigger', methods, route: 'hello' }] });
                const func = new TestFunction(project, 'functionName', config);
                const triggerRequest = await func.getTriggerRequest(context);
                assert.strictEqual(triggerRequest?.method, expected);
                assert.strictEqual(triggerRequest?.url, 'https://localhost:7071/custom/hello?code=test-key');
                assert.strictEqual(triggerRequest?.rejectUnauthorized, false);

                const original = requestUtils.sendRequestWithExtTimeout;
                let called = false;
                try {
                    requestUtils.sendRequestWithExtTimeout = async (_context, options) => {
                        called = true;
                        assert.strictEqual(options.method, expected);
                        assert.strictEqual(options.url, triggerRequest?.url);
                        assert.strictEqual(options.body, expected === 'GET' || expected === 'HEAD' ? undefined : '{"name":"world"}');
                        return { status: 200, headers: createHttpHeaders(), request: createPipelineRequest({ url: options.url }), bodyAsText: '' };
                    };
                    await executeFunctionWithInput(context, { name: 'world' }, func);
                    assert.ok(called);
                } finally {
                    requestUtils.sendRequestWithExtTimeout = original;
                }
            });
        });
    }

    test('non-HTTP execution keeps POST admin invocation and input envelope', async () => {
        await runWithTestActionContext('testExecuteAdmin', async context => {
            const func = new TestFunction(project, 'timer', new ParsedFunctionJson({ bindings: [{ type: 'timerTrigger' }] }));
            assert.strictEqual(await func.getTriggerRequest(context), undefined);
            const original = requestUtils.sendRequestWithExtTimeout;
            try {
                requestUtils.sendRequestWithExtTimeout = async (_context, options) => {
                    assert.strictEqual(options.method, 'POST');
                    assert.strictEqual(options.url, 'https://localhost:7071/admin/functions/timer');
                    assert.strictEqual(options.body, '{"input":"data"}');
                    return { status: 200, headers: createHttpHeaders(), request: createPipelineRequest({ url: options.url }), bodyAsText: '' };
                };
                await executeFunctionWithInput(context, 'data', func);
            } finally {
                requestUtils.sendRequestWithExtTimeout = original;
            }
        });
    });

    test('HTTP 400 is not retried as a POST admin-style request', async () => {
        await runWithTestActionContext('testExecute400', async context => {
            const func = new TestFunction(project, 'getOnly', new ParsedFunctionJson({ bindings: [{ type: 'httpTrigger', methods: ['get'] }] }));
            const original = requestUtils.sendRequestWithExtTimeout;
            const error = new Error('Bad request');
            error.name = '400';
            try {
                requestUtils.sendRequestWithExtTimeout = async () => { throw error; };
                await assert.rejects(executeFunctionWithInput(context, '', func), candidate => candidate === error);
            } finally {
                requestUtils.sendRequestWithExtTimeout = original;
            }
        });
    });
});
