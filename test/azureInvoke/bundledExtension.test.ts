/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestUserInput } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as z from 'zod/mini';
import { parseInvocationCollection } from '../../src/azureInvoke/collectionFile';
import { mcpServerLabel } from '../../src/constants';
import { getTestApi } from '../utils/testApiAccess';
import { createMcpClient, findInvocationTab, invocation, runResultSchema, testServer, useInvokeTestServer, waitForInvocationTab, waitForTabChange } from './azureInvokeTestUtils';

suite('Azure Invoke bundled extension', () => {
    useInvokeTestServer();

    test('Create Invocation opens the manual editor without a picker', async () => {
        const api = await getTestApi();
        const handler = api.testing.registerOnActionStartHandler(context => {
            if (context.callbackId === 'azureFunctions.azureInvoke.add') {
                context.ui.showQuickPick = async () => { throw new Error('Manual creation opened a picker.'); };
                context.errorHandling.rethrow = true;
                context.errorHandling.suppressDisplay = true;
            }
        });
        try {
            await vscode.commands.executeCommand('azureFunctions.azureInvoke.add');
            await vscode.window.tabGroups.close(await waitForInvocationTab());
        } finally {
            handler.dispose();
        }
    });

    test('Build Invocations with Copilot opens the Azure Invoke agent in a new chat', async () => {
        const api = await getTestApi();
        const buildCommand = 'azureFunctions.azureInvoke.buildWithCopilot';
        const handler = api.testing.registerOnActionStartHandler(context => {
            if (context.callbackId === buildCommand) {
                context.errorHandling.rethrow = true;
                context.errorHandling.suppressDisplay = true;
            }
        });
        const originalExecuteCommand = vscode.commands.executeCommand;
        const chatCalls: unknown[][] = [];
        // Capture the handoff without submitting a live Copilot request.
        vscode.commands.executeCommand = <T>(command: string, ...args: unknown[]): Thenable<T> => {
            if (command === 'workbench.action.chat.open') {
                chatCalls.push(args);
                return originalExecuteCommand<T>('setContext', 'azureInvokeTest.chatOpened', true);
            }
            return originalExecuteCommand<T>(command, ...args);
        };
        try {
            await vscode.commands.executeCommand(buildCommand);
            const chatOptionsSchema = z.object({ mode: z.string(), query: z.string(), newSession: z.boolean() });
            assert.strictEqual(chatCalls.length, 1);
            const [chatOptions] = z.tuple([chatOptionsSchema]).parse(chatCalls[0]);
            assert.strictEqual(chatOptions.mode, 'Azure Invoke');
            assert.strictEqual(chatOptions.newSession, true);
            assert.ok(chatOptions.query.includes('Do not run invocations or edit project files.'));
        } finally {
            vscode.commands.executeCommand = originalExecuteCommand;
            await originalExecuteCommand('setContext', 'azureInvokeTest.chatOpened', undefined);
            handler.dispose();
        }
    });

    test('bundled MCP creates and runs invocations in the same collection used by commands', async () => {
        const api = await getTestApi();
        const mcp = await api.testing.startMcpServer();
        const rpc = createMcpClient(mcp);
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-invoke-mcp-'));
        const target = vscode.Uri.file(path.join(directory, 'collection.json'));
        const toolbarTarget = vscode.Uri.file(path.join(directory, 'inventory.collection.json'));
        const toolbarContext = { viewId: 'azureFunctions.azureInvoke' };
        // Replace only the native file picker. The commands still write and reopen real files.
        const originalShowSaveDialog = vscode.window.showSaveDialog;
        let saveDialogCalls = 0;
        let cancelSaveDialog = false;
        vscode.window.showSaveDialog = async options => {
            saveDialogCalls++;
            assert.strictEqual(options?.title, 'Save Azure Invoke Collection As');
            return cancelSaveDialog ? undefined : toolbarTarget;
        };
        const ui = new TestUserInput(vscode);
        const handler = api.testing.registerOnActionStartHandler(context => {
            if (context.callbackId === 'azureFunctions.azureInvoke.saveCollection' ||
                context.callbackId === 'azureFunctions.azureInvoke.openCollection') {
                context.ui = ui;
                context.errorHandling.rethrow = true;
                context.errorHandling.suppressDisplay = true;
            }
        });
        try {
            await rpc('initialize', {
                protocolVersion: '2025-11-25',
                capabilities: {},
                clientInfo: { name: 'azure-invoke-bundle-test', version: '1.0.0' },
            });
            await rpc('notifications/initialized', {}, true);
            const discovered = z.object({ result: z.object({ tools: z.array(z.object({ name: z.string() })) }) })
                .parse(await rpc('tools/list', {}));
            assert.deepStrictEqual(discovered.result.tools.map(tool => tool.name).sort(), [
                'create_http_invocation', 'list_http_invocations', 'run_http_invocation',
            ]);
            const listed = z.object({
                result: z.object({ structuredContent: z.object({ invocations: z.array(z.object({ id: z.string(), name: z.string(), method: z.string(), dependencyIds: z.array(z.string()) })) }) }),
            }).parse(await rpc('tools/call', { name: 'list_http_invocations', arguments: {} }));
            assert.deepStrictEqual(listed.result.structuredContent.invocations, []);
            const requestCountBeforeCreation = testServer.receivedRequests;
            const savedRequest = { ...invocation().request, headers: [] };
            const input = { name: 'Bundled AI request', group: 'Accounts', ...savedRequest };
            const created = z.object({
                result: z.object({ structuredContent: z.object({ id: z.string() }) }),
            }).parse(await rpc('tools/call', { name: 'create_http_invocation', arguments: input }));
            assert.ok(!findInvocationTab(input.name));
            assert.strictEqual(testServer.receivedRequests, requestCountBeforeCreation);
            const ran = z.object({ result: runResultSchema }).parse(await rpc('tools/call', {
                name: 'run_http_invocation', arguments: { id: created.result.structuredContent.id },
            })).result;
            assert.notStrictEqual(ran.isError, true);
            assert.strictEqual(ran.structuredContent.status, 200);
            assert.strictEqual(JSON.parse(ran.structuredContent.body ?? '').body, input.body);
            assert.strictEqual(testServer.receivedRequests, requestCountBeforeCreation + 1);
            assert.ok(!findInvocationTab(input.name), 'AI execution opened an unsolicited request tab.');
            await ui.runWithInputs([], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.saveCollection', target);
            });
            const saved = parseInvocationCollection(await fs.readFile(target.fsPath, 'utf8'));
            assert.deepStrictEqual(saved, [{ id: created.result.structuredContent.id, name: input.name, group: input.group, request: savedRequest }]);
            assert.strictEqual(saveDialogCalls, 0);
            await ui.runWithInputs([], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.saveCollection', toolbarContext);
            });
            assert.strictEqual(saveDialogCalls, 1);
            assert.deepStrictEqual(parseInvocationCollection(await fs.readFile(toolbarTarget.fsPath, 'utf8')), saved);

            cancelSaveDialog = true;
            await ui.runWithInputs([], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.saveCollection', toolbarContext);
            });
            assert.strictEqual(saveDialogCalls, 2);
            assert.deepStrictEqual(parseInvocationCollection(await fs.readFile(toolbarTarget.fsPath, 'utf8')), saved);

            await ui.runWithInputs(['Open Collection', toolbarTarget.fsPath], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.openCollection', toolbarContext);
            });
            await waitForTabChange(() => !findInvocationTab(input.name));
            const statusSchema = z.object({ result: z.object({ structuredContent: z.object({ invocations: z.array(z.object({ id: z.string(), group: z.string(), status: z.string() })) }) }) });
            const reopenedStatus = statusSchema.parse(await rpc('tools/call', { name: 'list_http_invocations', arguments: {} }));
            assert.deepStrictEqual(reopenedStatus.result.structuredContent.invocations.map(({ id, status }) => ({ id, status })), [{ id: created.result.structuredContent.id, status: 'notRun' }],
                'Opening a collection kept run status from the previous session.');
            assert.strictEqual(reopenedStatus.result.structuredContent.invocations[0].group, input.group);
            await vscode.commands.executeCommand('azureFunctions.azureInvoke.open', { id: created.result.structuredContent.id });
            await waitForInvocationTab(input.name);
            await vscode.window.tabGroups.close(await waitForInvocationTab(input.name));
            await waitForTabChange(() => !findInvocationTab(input.name));
            await vscode.commands.executeCommand('azureFunctions.azureInvoke.open', { id: created.result.structuredContent.id });
            const reopened = await waitForInvocationTab(input.name);
            await vscode.window.tabGroups.close(reopened);
            assert.strictEqual(testServer.receivedRequests, requestCountBeforeCreation + 1);
        } finally {
            vscode.window.showSaveDialog = originalShowSaveDialog;
            handler.dispose();
            mcp.disposable.dispose();
            await fs.remove(directory);
        }
    });

    test('bundled agent only references tools the bundled MCP server provides', async () => {
        const api = await getTestApi();
        const context = api.extensionVariables.getContext();
        assert.ok(context);
        const agents = z.array(z.object({ name: z.string(), path: z.string() })).parse(context.extension.packageJSON.contributes.chatAgents);
        const agent = agents.find(agent => agent.name === 'azure-invoke');
        assert.ok(agent);
        const content = await fs.readFile(path.join(context.extensionPath, agent.path), 'utf8');
        const toolPrefix = `  - ${mcpServerLabel}/`;
        const agentTools = content.split(/\r?\n/).filter(line => line.startsWith(toolPrefix)).map(line => line.slice(toolPrefix.length)).sort();

        const mcp = await api.testing.startMcpServer();
        const rpc = createMcpClient(mcp);
        try {
            await rpc('initialize', {
                protocolVersion: '2025-11-25',
                capabilities: {},
                clientInfo: { name: 'azure-invoke-agent-test', version: '1.0.0' },
            });
            await rpc('notifications/initialized', {}, true);
            const discovered = z.object({ result: z.object({ tools: z.array(z.object({ name: z.string() })) }) })
                .parse(await rpc('tools/list', {}));
            assert.deepStrictEqual(agentTools, discovered.result.tools.map(tool => tool.name).sort());
        } finally {
            mcp.disposable.dispose();
        }
    });
});
