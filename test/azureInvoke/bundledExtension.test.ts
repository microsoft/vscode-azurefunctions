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
import { invokeServer, useInvokeTestServer, invocation, createMcpClient, runResultSchema, findInvocationTab, waitForTabChange, waitForInvocationTab } from './azureInvokeTestUtils';

function countInvocationTabs(): number {
    return vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab =>
        tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('azureInvokeHttpRequest')).length;
}

suite('Azure Invoke bundled extension', () => {
    useInvokeTestServer();

    test('Create Invocation opens an HTTP request editor and rejects unsupported triggers', async () => {
        const api = await getTestApi();
        const ui = new TestUserInput(vscode);
        const handler = api.testing.registerOnActionStartHandler(context => {
            if (context.callbackId === 'azureFunctions.azureInvoke.add') {
                context.ui = ui;
                context.errorHandling.rethrow = true;
                context.errorHandling.suppressDisplay = true;
            }
        });
        try {
            await ui.runWithInputs(['HTTP trigger'], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.add');
            });
            await vscode.window.tabGroups.close(await waitForInvocationTab());

            const tabCount = countInvocationTabs();
            await ui.runWithInputs(['Azure Queue Storage trigger'], async () => {
                await assert.rejects(async () => await vscode.commands.executeCommand('azureFunctions.azureInvoke.add'), /is not yet supported/);
            });
            assert.strictEqual(countInvocationTabs(), tabCount, 'An unsupported trigger opened an editor.');
        } finally {
            handler.dispose();
        }
    });

    test('bundled MCP creates and runs invocations in the same collection used by commands', async () => {
        const api = await getTestApi();
        const mcp = await api.testing.startMcpServer();
        const rpc = createMcpClient(mcp);
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-invoke-mcp-'));
        const target = vscode.Uri.file(path.join(directory, 'collection.json'));
        const toolbarTarget = vscode.Uri.file(path.join(directory, 'toolbar-collection.json'));
        const toolbarContext = { viewId: 'azureFunctions.azureInvoke' };
        const showSaveDialog = vscode.window.showSaveDialog;
        let saveDialogCalls = 0;
        let cancelSaveDialog = false;
        vscode.window.showSaveDialog = async () => {
            saveDialogCalls++;
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
            const before = invokeServer.receivedRequests;
            const input = { name: 'Bundled AI request', ...invocation().request };
            const created = z.object({
                result: z.object({ structuredContent: z.object({ id: z.string() }) }),
            }).parse(await rpc('tools/call', { name: 'create_http_invocation', arguments: input }));
            assert.ok(!findInvocationTab(input.name));
            assert.strictEqual(invokeServer.receivedRequests, before);
            const ran = z.object({ result: runResultSchema }).parse(await rpc('tools/call', {
                name: 'run_http_invocation', arguments: { id: created.result.structuredContent.id },
            })).result;
            assert.notStrictEqual(ran.isError, true);
            assert.strictEqual(ran.structuredContent.status, 200);
            assert.strictEqual(JSON.parse(ran.structuredContent.body ?? '').body, input.body);
            assert.strictEqual(invokeServer.receivedRequests, before + 1);
            assert.ok(!findInvocationTab(input.name), 'AI execution opened an unsolicited request tab.');
            await ui.runWithInputs(['Save Collection'], async () => {
                await vscode.commands.executeCommand('azureFunctions.azureInvoke.saveCollection', target);
            });
            const saved = parseInvocationCollection(await fs.readFile(target.fsPath, 'utf8'));
            assert.deepStrictEqual(saved, [{ id: created.result.structuredContent.id, name: input.name, request: invocation().request }]);
            assert.strictEqual(saveDialogCalls, 0);
            await ui.runWithInputs(['Save Collection'], async () => {
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
            const statusSchema = z.object({ result: z.object({ structuredContent: z.object({ invocations: z.array(z.object({ id: z.string(), status: z.string() })) }) }) });
            const reopenedStatus = statusSchema.parse(await rpc('tools/call', { name: 'list_http_invocations', arguments: {} }));
            assert.deepStrictEqual(reopenedStatus.result.structuredContent.invocations.map(({ id, status }) => ({ id, status })), [{ id: created.result.structuredContent.id, status: 'notRun' }],
                'Opening a collection kept run status from the previous session.');
            await vscode.commands.executeCommand('azureFunctions.azureInvoke.open', { id: created.result.structuredContent.id });
            await waitForInvocationTab(input.name);
            await vscode.window.tabGroups.close(await waitForInvocationTab(input.name));
            await waitForTabChange(() => !findInvocationTab(input.name));
            await vscode.commands.executeCommand('azureFunctions.azureInvoke.open', { id: created.result.structuredContent.id });
            const reopened = await waitForInvocationTab(input.name);
            await vscode.window.tabGroups.close(reopened);
            assert.strictEqual(invokeServer.receivedRequests, before + 1);
        } finally {
            vscode.window.showSaveDialog = showSaveDialog;
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
