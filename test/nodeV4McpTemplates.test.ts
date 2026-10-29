/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import * as vm from 'vm';
import { verifyNodeV4McpDependency } from '../src/commands/createFunction/scriptSteps/verifyNodeV4McpDependency';
import { type IRawTemplate } from '../src/templates/script/parseScriptTemplates';

const projectRoot = path.resolve(__dirname, '..');
const templates = fs.readJSONSync(path.join(projectRoot, 'resources', 'backupTemplates', 'nodejs-4.x', 'templates', 'templates.json')) as IRawTemplate[];
const mcpTemplates = templates.filter(template => template.id?.startsWith('Mcp'));
const typescriptTemplates = mcpTemplates.filter(template => template.metadata?.language === 'TypeScript');

function materialize(template: IRawTemplate, functionName: string): string {
    assert.ok(template.files);
    const sources = Object.values(template.files);
    assert.strictEqual(sources.length, 1);
    return sources[0].replace(/%functionName%/g, functionName);
}

function compile(template: IRawTemplate, sdk: string, functionName = 'chosenFunction'): readonly ts.Diagnostic[] {
    const filename = path.join(projectRoot, 'test', 'mcpTemplate.ts');
    const source = materialize(template, functionName);
    const options: ts.CompilerOptions = {
        strict: true,
        noEmit: true,
        module: ts.ModuleKind.Node16,
        moduleResolution: ts.ModuleResolutionKind.Node16,
        target: ts.ScriptTarget.ES2022,
        types: ['node'],
        baseUrl: projectRoot,
        paths: { '@azure/functions': [path.dirname(require.resolve(`${sdk}/package.json`))] }
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => path.resolve(file) === filename
        ? ts.createSourceFile(file, source, languageVersion)
        : getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
    return ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
}

suite('Node v4 MCP templates', () => {
    test('includes JavaScript and TypeScript Tool, Prompt, and Resource templates', () => {
        assert.strictEqual(mcpTemplates.length, 6);
        assert.strictEqual(typescriptTemplates.length, 3);
    });

    for (const template of mcpTemplates) {
        test(`${template.id} uses the selected name for each registration and identity`, () => {
            const registrations: { kind: string; name: string; options: { handler: { name: string }; toolName?: string; promptName?: string; resourceName?: string; uri?: string } }[] = [];
            const app = Object.fromEntries(['mcpTool', 'mcpPrompt', 'mcpResource'].map(kind => [kind, (name: string, options: typeof registrations[number]['options']) => {
                assert.ok(!registrations.some(registration => registration.name === name), `Duplicate function registration: ${name}`);
                registrations.push({ kind, name, options });
            }]));
            const sdk = {
                app,
                arg: { string: () => ({ describe: () => ({}) }) },
                promptArg: { describe: () => ({ isRequired: () => ({}) }) }
            };
            const names = template.metadata?.triggerType === 'mcpPromptTrigger'
                ? ['firstFunction', 'secondFunction']
                : ['firstFunction', 'secondFunction', 'hello-world', 'app', 'arg', 'class'];
            for (const name of names) {
                const source = materialize(template, name);
                assert.ok(!source.includes('%functionName%'));
                const javascript = template.metadata?.language === 'TypeScript'
                    ? ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
                    : source;
                vm.runInNewContext(javascript, {
                    exports: {},
                    require: (id: string) => {
                        assert.strictEqual(id, '@azure/functions');
                        return sdk;
                    }
                });
            }
            assert.deepStrictEqual(registrations.map(registration => registration.name), names);
            for (const [index, registration] of registrations.entries()) {
                const name = names[index];
                const handlerName = registration.kind === 'mcpTool' ? 'mcpToolHello' : registration.kind === 'mcpResource' ? 'mcpResourceHello' : name;
                assert.strictEqual(registration.options.handler.name, handlerName);
                const identity = registration.options.toolName ?? registration.options.promptName ?? registration.options.resourceName;
                assert.strictEqual(identity, name);
                if (registration.kind === 'mcpResource') {
                    assert.strictEqual(registration.options.uri, `file://${name}.txt`);
                }
            }
        });
    }

    for (const template of typescriptTemplates.filter(template => template.metadata?.triggerType !== 'mcpPromptTrigger')) {
        for (const name of ['hello-world', 'app', 'arg', 'class']) {
            test(`${template.id} compiles with accepted name ${name}`, () => {
                const sdk = template.metadata?.triggerType === 'mcpToolTrigger' ? '@azure/functions-4-11' : '@azure/functions-4-12';
                const diagnostics = compile(template, sdk, name);
                assert.strictEqual(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                    getCurrentDirectory: () => projectRoot,
                    getCanonicalFileName: filename => filename,
                    getNewLine: () => '\n'
                }));
            });
        }
    }

    for (const sdk of ['@azure/functions-4-11', '@azure/functions-4-12', '@azure/functions-4-13', '@azure/functions-4-14']) {
        for (const template of typescriptTemplates) {
            test(`${template.id} compatibility with ${sdk}`, () => {
                const diagnostics = compile(template, sdk);
                const supported = template.metadata?.triggerType === 'mcpToolTrigger'
                    || (template.metadata?.triggerType === 'mcpResourceTrigger' && sdk !== '@azure/functions-4-11')
                    || sdk === '@azure/functions-4-14';
                if (supported) {
                    assert.strictEqual(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                        getCurrentDirectory: () => projectRoot,
                        getCanonicalFileName: filename => filename,
                        getNewLine: () => '\n'
                    }));
                } else {
                    assert.ok(diagnostics.some(diagnostic => diagnostic.code === 2339), 'Expected a missing SDK registration API');
                    assert.ok(diagnostics.every(diagnostic => [2305, 2339, 2724].includes(diagnostic.code)), 'Unexpected diagnostic beyond missing SDK APIs');
                }
            });
        }
    }
});

suite('Node v4 MCP dependency validation', () => {
    let projectPath: string;

    setup(async () => {
        projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-mcp-'));
        await fs.writeJSON(path.join(projectPath, 'package.json'), { dependencies: { '@azure/functions': '^4.0.0' } });
        await fs.writeJSON(path.join(projectPath, 'package-lock.json'), { lockfileVersion: 3 });
    });

    teardown(async () => {
        await fs.remove(projectPath);
    });

    async function install(version: string): Promise<void> {
        await fs.outputJSON(path.join(projectPath, 'node_modules', '@azure', 'functions', 'package.json'), { name: '@azure/functions', version });
    }

    for (const [trigger, minimum, previous] of [['mcpResourceTrigger', '4.12.0', '4.11.2'], ['mcpPromptTrigger', '4.14.0', '4.13.0']]) {
        test(`${trigger} accepts its minimum and newer installed SDKs`, async () => {
            for (const version of [minimum, '4.16.1']) {
                await install(version);
                await verifyNodeV4McpDependency(projectPath, trigger);
            }
        });

        test(`${trigger} rejects old, missing, invalid, and minimum prerelease SDKs without changing project files`, async () => {
            const packageBefore = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
            const lockBefore = await fs.readFile(path.join(projectPath, 'package-lock.json'), 'utf8');
            for (const version of [undefined, previous, 'invalid', `${minimum}-preview.1`]) {
                if (version) {
                    await install(version);
                }
                await assert.rejects(verifyNodeV4McpDependency(projectPath, trigger), error => {
                    assert.ok(error instanceof Error);
                    assert.ok(error.message.includes(`npm install @azure/functions@^${minimum}`));
                    return true;
                });
                assert.strictEqual(await fs.readFile(path.join(projectPath, 'package.json'), 'utf8'), packageBefore);
                assert.strictEqual(await fs.readFile(path.join(projectPath, 'package-lock.json'), 'utf8'), lockBefore);
                assert.strictEqual(await fs.pathExists(path.join(projectPath, 'src')), false);
            }
        });
    }

    test('uses the installed SDK rather than a permissive manifest range', async () => {
        await install('4.11.2');
        await assert.rejects(verifyNodeV4McpDependency(projectPath, 'mcpPromptTrigger'));
        await assert.rejects(verifyNodeV4McpDependency(projectPath, 'mcpResourceTrigger'));
        await verifyNodeV4McpDependency(projectPath, 'mcpToolTrigger');
    });

    for (const sdk of ['@azure/functions-4-11', '@azure/functions-4-12', '@azure/functions-4-13', '@azure/functions-4-14']) {
        test(`validates both languages against the actual installed ${sdk} package`, async () => {
            const sdkPath = path.join(projectPath, 'node_modules', '@azure', 'functions');
            await fs.ensureDir(path.dirname(sdkPath));
            await fs.symlink(path.dirname(require.resolve(`${sdk}/package.json`)), sdkPath, 'junction');
            for (const template of mcpTemplates) {
                const trigger = template.metadata?.triggerType;
                const supported = trigger === 'mcpToolTrigger'
                    || (trigger === 'mcpResourceTrigger' && sdk !== '@azure/functions-4-11')
                    || sdk === '@azure/functions-4-14';
                if (supported) {
                    await verifyNodeV4McpDependency(projectPath, trigger);
                } else {
                    await assert.rejects(verifyNodeV4McpDependency(projectPath, trigger));
                }
            }
        });
    }

    test('does not impose MCP requirements on other templates', async () => {
        await verifyNodeV4McpDependency(projectPath, 'httpTrigger');
        await verifyNodeV4McpDependency(projectPath, undefined);
        await verifyNodeV4McpDependency(projectPath, 'mcpToolTrigger');
    });
});
