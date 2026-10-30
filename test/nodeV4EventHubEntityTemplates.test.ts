/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpResponse } from '@azure/functions';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Script } from 'vm';
import * as ts from 'typescript';
import { type IConfig, type IRawTemplate } from '../src/templates/script/parseScriptTemplates';

const templateRoot = path.resolve(__dirname, '..', 'resources', 'backupTemplates', 'nodejs-4.x');
const templates: IRawTemplate[] = JSON.parse(fs.readFileSync(path.join(templateRoot, 'templates', 'templates.json'), 'utf8'));
const bindings: IConfig = JSON.parse(fs.readFileSync(path.join(templateRoot, 'bindings', 'bindings.json'), 'utf8'));

// Match parseScriptTemplates and NodeV4FunctionCreateStep: only declared prompts are substituted.
function materialize(id: string, values: Record<string, string> = {}): string {
    const template = templates.find(candidate => candidate.id === id);
    assert.ok(template?.metadata);
    const binding = bindings.bindings?.find(candidate => candidate.type === template.metadata?.triggerType);
    const settings = template.metadata.userPrompt?.flatMap(name => binding?.settings?.filter(setting => setting.name === name) ?? []) ?? [];
    assert.deepStrictEqual(settings.map(setting => setting.name), template.metadata.userPrompt);
    const files = Object.values(template.files ?? {});
    assert.strictEqual(files.length, 1);
    let source = files[0].replace(/%functionName%/g, 'sample');
    for (const setting of settings) {
        assert.ok(values[setting.name.toLowerCase()], `Missing prompted setting: ${setting.name}`);
        source = source.replace(new RegExp(`%${setting.name}%`, 'g'), values[setting.name.toLowerCase()]);
    }
    assert.doesNotMatch(source, /%[a-zA-Z]+%/, 'Generated source must not retain template placeholders');
    return source;
}

function assertStrictCompiles(source: string): void {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'functions-node-v4-'));
    try {
        const sourcePath = path.join(projectPath, 'sample.ts');
        fs.writeFileSync(sourcePath, source);
        const program = ts.createProgram([sourcePath], {
            strict: true,
            noEmit: true,
            module: ts.ModuleKind.Node16,
            moduleResolution: ts.ModuleResolutionKind.Node16,
            target: ts.ScriptTarget.ES2022,
            baseUrl: path.resolve(__dirname, '..'),
            paths: {
                '@azure/functions': [path.dirname(require.resolve('@azure/functions/package.json'))],
                'durable-functions': [path.dirname(require.resolve('durable-functions/package.json'))]
            },
            typeRoots: [path.resolve(__dirname, '..', 'node_modules', '@types')],
            types: ['node']
        });
        const diagnostics = ts.getPreEmitDiagnostics(program);
        assert.strictEqual(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCanonicalFileName: filename => filename,
            getCurrentDirectory: () => projectPath,
            getNewLine: () => os.EOL
        }));
    } finally {
        fs.rmSync(projectPath, { recursive: true, force: true });
    }
}

interface CounterContext {
    df: {
        operationName: string;
        getState: (initializer: () => number) => number | undefined;
        getInput: () => unknown;
        setState: (state: number) => void;
        return: (state: number) => void;
    };
}

interface EntityFixture {
    entity: (context: CounterContext) => void;
    http: (request: { method: string; params: { id: string } }, context: object) => Promise<HttpResponse>;
    signals: unknown[][];
}

function loadEntity(language: 'JavaScript' | 'TypeScript'): EntityFixture {
    const source = materialize(`DurableFunctionsEntity-${language}-4.x`);
    const signals: unknown[][] = [];
    let entity: EntityFixture['entity'] | undefined;
    let http: EntityFixture['http'] | undefined;
    const client = {
        signalEntity: async (...args: unknown[]) => { signals.push(args); },
        readEntityState: async () => ({ entityState: 7 })
    };
    const script = language === 'TypeScript' ? ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText : source;
    new Script(script).runInNewContext({
        exports: {},
        require: (id: string) => {
            if (id === '@azure/functions') {
                return { HttpResponse, app: { http: (_name: string, options: { handler: EntityFixture['http'] }) => { http = options.handler; } } };
            } else if (id === 'durable-functions') {
                return {
                    app: { entity: (_name: string, handler: EntityFixture['entity']) => { entity = handler; } },
                    input: { durableClient: () => ({}) },
                    EntityId: class { constructor(public name: string, public key: string) { } },
                    getClient: () => client
                };
            }
            throw new Error(`Unexpected generated import: ${id}`);
        }
    });
    assert.ok(entity);
    assert.ok(http);
    return { entity, http, signals };
}

suite('Node v4 Event Hub and Durable Entity templates', () => {
    for (const language of ['JavaScript', 'TypeScript'] as const) {
        test(`${language} Event Hub prompts for a connection before the hub name`, () => {
            const template = templates.find(candidate => candidate.id === `EventHubTrigger-${language}-4.x`);
            assert.deepStrictEqual(template?.metadata?.userPrompt, ['connection', 'eventHubName']);
            const connection = bindings.bindings?.find(binding => binding.type === 'eventHubTrigger')?.settings?.find(setting => setting.name === 'connection');
            assert.strictEqual(connection?.resource, 'EventHub');
            assert.strictEqual(connection?.required, true);
            assert.strictEqual(connection?.defaultValue, undefined);
            for (const name of ['EventHubConnection', 'IdentityConnectionPrefix']) {
                const source = materialize(`EventHubTrigger-${language}-4.x`, { connection: name, eventhubname: 'sample-hub' });
                assert.ok(source.includes(`connection: '${name}'`));
                assert.ok(source.includes("eventHubName: 'sample-hub'"));
            }
        });

        test(`${language} Entity preserves add, reset, get, and zero initialization`, () => {
            const { entity } = loadEntity(language);
            let state: number | undefined;
            let returned: number | undefined;
            const context: CounterContext = {
                df: {
                    operationName: 'get',
                    getState: initializer => state === undefined ? initializer() : state,
                    getInput: () => 3,
                    setState: value => { state = value; },
                    return: value => { returned = value; }
                }
            };
            entity(context);
            assert.strictEqual(returned, 0);
            context.df.operationName = 'add';
            entity(context);
            assert.strictEqual(state, 3);
            entity(context);
            assert.strictEqual(state, 6);
            context.df.operationName = 'get';
            entity(context);
            assert.strictEqual(returned, 6);
            context.df.operationName = 'reset';
            entity(context);
            assert.strictEqual(state, 0);
        });

        test(`${language} Entity rejects missing or invalid add input without changing state`, () => {
            const { entity } = loadEntity(language);
            for (const input of [undefined, null, '1', NaN, Infinity, -Infinity]) {
                assert.throws(() => entity({
                    df: {
                        operationName: 'add',
                        getState: () => 2,
                        getInput: () => input,
                        setState: () => assert.fail('Invalid input must not change state'),
                        return: () => assert.fail('Invalid input must not return a value')
                    }
                }), /add operation requires a finite number/);
            }
        });

        test(`${language} Entity reports unavailable state explicitly`, () => {
            const { entity } = loadEntity(language);
            assert.throws(() => entity({
                df: {
                    operationName: 'get',
                    getState: () => undefined,
                    getInput: () => undefined,
                    setState: () => assert.fail('Unavailable state must not be overwritten'),
                    return: () => assert.fail('Unavailable state must not be returned')
                }
            }), /Counter state is unavailable/);
        });

        test(`${language} Entity HTTP starter returns 202 after signaling and preserves reads`, async () => {
            const { http, signals } = loadEntity(language);
            const accepted = await http({ method: 'POST', params: { id: 'counter-1' } }, {});
            assert.ok(accepted instanceof HttpResponse);
            assert.strictEqual(accepted.status, 202);
            assert.strictEqual(signals.length, 1);
            assert.deepStrictEqual(signals[0].slice(1), ['add', 1]);
            assert.deepStrictEqual(JSON.parse(JSON.stringify(signals[0][0])), { name: 'sample', key: 'counter-1' });
            const read = await http({ method: 'GET', params: { id: 'counter-1' } }, {});
            assert.strictEqual(read.status, 200);
            assert.strictEqual(await read.text(), '7');
            assert.strictEqual(signals.length, 1);
        });
    }

    for (const id of ['EventHubTrigger', 'DurableFunctionsEntity', 'DurableFunctionsOrchestrator']) {
        test(`${id} TypeScript compiles in strict mode with the real SDKs`, function (): void {
            this.timeout(30000);
            assertStrictCompiles(materialize(`${id}-TypeScript-4.x`, { connection: 'EventHubConnection', eventhubname: 'sample-hub' }));
        });
    }
});
