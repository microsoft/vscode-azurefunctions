/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedSite, SiteClient } from '@microsoft/vscode-azext-azureappservice';
import { UserCancelledError, createTestActionContext, type IActionContext, type TestUserInput } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { createServer, type IncomingHttpHeaders, type Server } from 'http';
import { executeFunction, executeFunctionWithInput } from '../src/commands/executeFunction/executeFunction';
import { ext } from '../src/extensionVariables';
import { ParsedFunctionJson } from '../src/funcConfig/function';
import { FuncVersion } from '../src/FuncVersion';
import { CentralTemplateProvider } from '../src/templates/CentralTemplateProvider';
import { type IProjectTreeItem } from '../src/tree/IProjectTreeItem';
import { ProjectSource } from '../src/tree/projectContextValues';
import { RemoteFunction } from '../src/tree/remoteProject/RemoteFunction';
import { RemoteFunctionTreeItem } from '../src/tree/remoteProject/RemoteFunctionTreeItem';
import { LocalFunction } from '../src/workspace/LocalFunction';

suite('Execute Function HTTP methods', () => {
    let server: Server;
    let hostUrl: string;
    let requests: { method: string | undefined; url: string | undefined; body: string; headers: IncomingHttpHeaders }[];
    let responses: { status: number; body: string }[];
    let project: IProjectTreeItem;
    let templateProvider: CentralTemplateProvider;
    let sampleLookups: number;
    let originalExecuting: typeof ext.isExecutingFunction;
    let originalExecutingNode: typeof ext.currentExecutingFunctionNode;

    setup(async () => {
        originalExecuting = ext.isExecutingFunction;
        originalExecutingNode = ext.currentExecutingFunctionNode;
        requests = [];
        responses = [];
        sampleLookups = 0;
        server = createServer((request, response) => {
            let body = '';
            request.setEncoding('utf8');
            request.on('data', (chunk: string) => { body += chunk; });
            request.on('end', () => {
                requests.push({ method: request.method, url: request.url, body, headers: request.headers });
                const reply = responses.shift() ?? { status: 200, body: 'Hello, World!' };
                response.writeHead(reply.status);
                response.end(reply.body);
            });
        });
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        hostUrl = `http://127.0.0.1:${address.port}`;
        project = {
            source: ProjectSource.Local,
            getHostRequest: async () => ({ url: hostUrl, rejectUnauthorized: false }),
            getHostJson: async () => ({ routePrefix: 'api' }),
            getVersion: async () => FuncVersion.v4,
            getApplicationSettings: async () => ({}),
            setApplicationSetting: async () => assert.fail('Invocation must not change app settings.'),
        };
        templateProvider = new CentralTemplateProvider();
        templateProvider.tryGetSampleData = async () => {
            sampleLookups++;
            return undefined;
        };
    });

    teardown(async () => {
        ext.isExecutingFunction = originalExecuting;
        ext.currentExecutingFunctionNode = originalExecutingNode;
        templateProvider.dispose();
        await new Promise<void>((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
            server.closeAllConnections();
        });
    });

    function createFunction(methods?: unknown, triggerType: string = 'httpTrigger'): LocalFunction {
        return new LocalFunction(project, 'testFunction', new ParsedFunctionJson({
            bindings: [{ type: triggerType, route: 'invoke', methods, authLevel: 'anonymous' }],
        }));
    }

    async function createContext(): Promise<IActionContext & { ui: TestUserInput }> {
        const context = await createTestActionContext();
        ext.templateProvider.registerActionVariable(templateProvider, context);
        return context;
    }

    for (const [name, methods, expectedMethod] of [
        ['GET-only', ['GET'], 'GET'],
        ['HEAD-only', ['HEAD'], 'HEAD'],
        ['POST-only', ['POST'], 'POST'],
        ['PUT-only', ['PUT'], 'PUT'],
        ['PATCH-only', ['PATCH'], 'PATCH'],
        ['DELETE-only', ['DELETE'], 'DELETE'],
        ['OPTIONS-only', ['OPTIONS'], 'OPTIONS'],
        ['TRACE-only', ['TRACE'], 'TRACE'],
        ['mixed methods prefer POST', ['GET', 'POST'], 'POST'],
        ['mixed casing', ['get', 'pOsT'], 'POST'],
        ['first non-POST method', ['put', 'GET'], 'PUT'],
        ['missing methods', undefined, 'POST'],
        ['unrestricted methods', [], 'POST'],
        ['malformed method list', 'GET', 'POST'],
        ['invalid method entries', [null, 1, {}, 'get'], 'GET'],
        ['unsupported methods', ['invalid'], 'POST'],
    ] as const) {
        test(`${name} uses ${expectedMethod} and the appropriate body`, async () => {
            const context = await createContext();
            const func = createFunction(methods);
            const input = { name: 'Azure' };

            await executeFunctionWithInput(context, input, func);

            assert.strictEqual(requests.length, 1);
            assert.strictEqual(requests[0].method, expectedMethod);
            assert.strictEqual(requests[0].url, '/api/invoke');
            assert.strictEqual(requests[0].body, expectedMethod === 'GET' || expectedMethod === 'HEAD' ? '' : JSON.stringify(input));
            assert.deepStrictEqual(await func.getTriggerRequest(context), {
                url: `${hostUrl}/api/invoke`, rejectUnauthorized: false, method: expectedMethod,
            });
        });
    }

    for (const method of ['GET', 'HEAD']) {
        test(`${method} skips the request-body prompt and sample-data lookup`, async () => {
            const context = await createContext();

            await context.ui.runWithInputs([], () => executeFunction(context, createFunction([method])));

            assert.strictEqual(sampleLookups, 0);
            assert.strictEqual(requests[0].method, method);
            assert.strictEqual(requests[0].body, '');
            assert.strictEqual(ext.isExecutingFunction, false);
            assert.strictEqual(ext.currentExecutingFunctionNode, undefined);
        });
    }

    for (const methods of [['POST'], ['GET', 'POST']]) {
        test(`${methods.join('/')} preserves JSON request-body input`, async () => {
            const context = await createContext();
            const input = '{"name":"Azure","age":42}';

            await context.ui.runWithInputs([input], () => executeFunction(context, createFunction(methods)));

            assert.strictEqual(sampleLookups, 1);
            assert.strictEqual(requests[0].method, 'POST');
            assert.strictEqual(requests[0].body, input);
        });
    }

    test('preserves string request bodies', async () => {
        await executeFunctionWithInput(await createContext(), 'plain text', createFunction(['POST']));
        assert.strictEqual(requests[0].body, JSON.stringify('plain text'));
    });

    test('keeps POST when only the invoke URL identifies an HTTP function', async () => {
        const func = new LocalFunction(project, 'testFunction', new ParsedFunctionJson({}), {
            invokeUrlTemplate: `${hostUrl}/api/invoke?name=Azure`,
        });

        await executeFunctionWithInput(await createContext(), {}, func);

        assert.strictEqual(requests[0].method, 'POST');
        assert.strictEqual(requests[0].url, '/api/invoke?name=Azure');
        assert.strictEqual(requests[0].body, '{}');
    });

    test('remote tree invocation preserves the URL query, function key, host key and protocol', async () => {
        const client: SiteClient = Object.create(SiteClient.prototype);
        client.listFunctionKeys = async () => ({ default: 'test-function-key' });
        client.listHostKeys = async () => ({ masterKey: 'test-host-key' });
        const site: ParsedSite = Object.create(ParsedSite.prototype);
        site.createClient = async () => client;
        const func = new RemoteFunction({ ...project, source: ProjectSource.Remote }, 'testFunction', new ParsedFunctionJson({
            bindings: [{ type: 'httpTrigger', methods: ['GET'], authLevel: 'function' }],
        }), site, { invokeUrlTemplate: `${hostUrl.replace('http:', 'https:')}/api/invoke?name=Azure` });
        let initialized = false;
        let temporaryDescription = false;
        const node: RemoteFunctionTreeItem = Object.create(RemoteFunctionTreeItem.prototype);
        Object.defineProperties(node, {
            function: { value: func },
            parent: { value: { parent: { site, initSite: async () => { initialized = true; } } } },
        });
        node.runWithTemporaryDescription = async (_context, _description, callback) => {
            temporaryDescription = true;
            return callback();
        };

        await executeFunctionWithInput(await createContext(), {}, node);

        assert.strictEqual(initialized, true);
        assert.strictEqual(temporaryDescription, true);
        assert.strictEqual(requests[0].method, 'GET');
        assert.strictEqual(requests[0].url, '/api/invoke?name=Azure&code=test-function-key');
        assert.strictEqual(requests[0].headers['x-functions-key'], 'test-host-key');
        assert.strictEqual(requests[0].body, '');
    });

    for (const trigger of ['queueTrigger', 'timerTrigger']) {
        test(`${trigger} preserves the non-HTTP admin POST`, async () => {
            const input = { message: 'test input' };
            const context = await createContext();
            const func = createFunction(undefined, trigger);

            assert.strictEqual(await func.getTriggerRequest(context), undefined);
            await executeFunctionWithInput(context, input, func);

            assert.strictEqual(requests[0].method, 'POST');
            assert.strictEqual(requests[0].url, '/admin/functions/testFunction');
            assert.deepStrictEqual(JSON.parse(requests[0].body), { input });
        });
    }

    test('timer execution still skips input and sends an empty admin input', async () => {
        const context = await createContext();

        await context.ui.runWithInputs([], () => executeFunction(context, createFunction(undefined, 'timerTrigger')));

        assert.strictEqual(sampleLookups, 0);
        assert.deepStrictEqual(JSON.parse(requests[0].body), { input: '' });
    });

    test('non-HTTP invocation always uses POST regardless of host request options', async () => {
        project.getHostRequest = async () => ({ url: hostUrl, method: 'GET' });

        await executeFunctionWithInput(await createContext(), 'test input', createFunction(undefined, 'queueTrigger'));

        assert.strictEqual(requests[0].method, 'POST');
        assert.deepStrictEqual(JSON.parse(requests[0].body), { input: 'test input' });
    });

    test('preserves the non-HTTP 400 string-input retry', async () => {
        responses.push({ status: 400, body: 'Input must be a string.' }, { status: 200, body: '' });
        const input = { message: 'test input' };

        await executeFunctionWithInput(await createContext(), input, createFunction(undefined, 'queueTrigger'));

        assert.strictEqual(requests.length, 2);
        assert.ok(requests.every(request => request.method === 'POST' && request.url === '/admin/functions/testFunction'));
        assert.deepStrictEqual(JSON.parse(requests[0].body), { input });
        assert.deepStrictEqual(JSON.parse(requests[1].body), { input: JSON.stringify(input) });
    });

    test('a GET 400 is reported without retrying as POST', async () => {
        responses.push({ status: 400, body: 'Invalid query.' });
        const context = await createContext();

        await assert.rejects(executeFunctionWithInput(context, {}, createFunction(['GET'])));

        assert.strictEqual(requests.length, 1);
        assert.strictEqual(requests[0].method, 'GET');
        assert.strictEqual(requests[0].body, '');
        assert.strictEqual(context.telemetry.maskEntireErrorMessage, true);
    });

    test('cancelling body input clears invocation state without sending a request', async () => {
        const context = await createContext();
        context.ui.showInputBox = async () => { throw new UserCancelledError(); };

        await assert.rejects(executeFunction(context, createFunction(['POST'])), UserCancelledError);

        assert.strictEqual(requests.length, 0);
        assert.strictEqual(ext.isExecutingFunction, false);
        assert.strictEqual(ext.currentExecutingFunctionNode, undefined);
    });

    test('cancelling GET key resolution clears invocation state without sending a request', async () => {
        const context = await createContext();
        const func = createFunction(['GET']);
        func.getKey = async () => { throw new UserCancelledError(); };

        await context.ui.runWithInputs([], async () => {
            await assert.rejects(executeFunction(context, func), UserCancelledError);
        });

        assert.strictEqual(requests.length, 0);
        assert.strictEqual(ext.isExecutingFunction, false);
        assert.strictEqual(ext.currentExecutingFunctionNode, undefined);
    });
});
