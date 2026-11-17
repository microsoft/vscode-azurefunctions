/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext, isUserCancelledError, TestUserInput, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseInvocationCollection, serializeInvocationCollection } from '../../src/azureInvoke/collectionFile';
import { type InvocationRunStatus } from '../../src/azureInvoke/ChainInvocationRunner';
import { openCollectionFile, saveCollectionFile } from '../../src/commands/azureInvoke/collectionFiles';
import { InvocationGroupItem } from '../../src/tree/azureInvoke/InvocationGroupItem';
import { InvocationItem } from '../../src/tree/azureInvoke/InvocationItem';
import { invokeServer, useInvokeTestServer, request, accountChain, invocation, createInvoke, getTreeItem } from './azureInvokeTestUtils';

suite('Azure Invoke collection and tree', () => {
    useInvokeTestServer();

    test('saves named snapshots without adding drafts or exposing request data in command arguments', () => {
        const invoke = createInvoke();
        try {
            assert.deepStrictEqual(invoke.collection.list(), []);
            const first = invoke.collection.createDraft();
            const second = invoke.collection.createDraft();
            assert.deepStrictEqual(invoke.collection.list(), []);
            const saved = { ...first, name: 'My endpoint', request: request({ headers: [{ name: 'x-functions-key', value: 'example-key' }] }) };
            invoke.collection.save(saved);
            const item = getTreeItem(invoke, first.id);
            assert.strictEqual(item.label, saved.name);
            assert.strictEqual(item.command?.command, 'azureFunctions.azureInvoke.open');
            const [node] = item.command?.arguments ?? [];
            assert.ok(node instanceof InvocationItem);
            assert.strictEqual(node.id, first.id);
            assert.ok(!JSON.stringify(item.command?.arguments).includes('example-key'));
            assert.deepStrictEqual(invoke.provider.getChildren(node), []);
            saved.request.headers[0].value = 'unsaved edit';
            assert.strictEqual(invoke.collection.get(first.id)?.request.headers[0].value, 'example-key');
            const reopened = invoke.collection.get(first.id);
            assert.ok(reopened);
            reopened.request.headers[0].value = 'another unsaved edit';
            assert.strictEqual(invoke.collection.get(first.id)?.request.headers[0].value, 'example-key');
            invoke.collection.save({ ...reopened, name: 'Renamed endpoint' });
            assert.strictEqual(invoke.collection.list().length, 1);
            assert.strictEqual(invoke.collection.list()[0].name, 'Renamed endpoint');
            assert.notStrictEqual(first.id, second.id);
        } finally {
            invoke.dispose();
        }
        assert.deepStrictEqual(invoke.collection.list(), []);
        const nextSession = createInvoke();
        assert.deepStrictEqual(nextSession.collection.list(), []);
        nextSession.dispose();
    });

    test('shows trigger types with last-run times and status icons instead of response descriptions', () => {
        const lastRun = new Date();
        function itemWithIcon(status: InvocationRunStatus | undefined, icon: string, color?: string): vscode.TreeItem {
            const item = new InvocationItem('saved-invocation', "Customer's endpoint", status).getTreeItem();
            assert.ok(item.iconPath instanceof vscode.ThemeIcon);
            assert.strictEqual(item.iconPath.id, icon);
            assert.strictEqual(item.iconPath.color?.id, color);
            return item;
        }
        const ready = itemWithIcon(undefined, 'circle-outline');
        assert.strictEqual(ready.description, 'HTTP Trigger');
        assert.strictEqual(ready.tooltip, 'Not run yet');
        const running = itemWithIcon({ state: 'running', lastRun }, 'loading~spin');
        assert.strictEqual(running.description, `HTTP Trigger (${lastRun.toLocaleTimeString()})`);
        assert.ok(String(running.tooltip).includes('Running...'));
        for (const [state, statusCode] of [['succeeded', 200], ['failed', 302], ['failed', 500]] as const) {
            const succeeded = state === 'succeeded';
            const finished = itemWithIcon({ state, lastRun, statusCode, duration: 12 }, succeeded ? 'pass' : 'error', succeeded ? 'testing.iconPassed' : 'testing.iconFailed');
            assert.strictEqual(finished.description, running.description);
            assert.ok(String(finished.tooltip).includes(`${statusCode}, 12 ms`));
        }
        assert.ok(String(itemWithIcon({ state: 'failed', lastRun }, 'error', 'testing.iconFailed').tooltip).endsWith('Failed'));
        assert.ok(String(itemWithIcon({ state: 'cancelled', lastRun }, 'circle-slash').tooltip).endsWith('Cancelled'));
        itemWithIcon({ state: 'blocked', lastRun }, 'warning', 'problemsWarningIcon.foreground');
    });

    test('run status survives renames, reflects 2xx results only, and resets when the runner is cleared', async () => {
        const invoke = createInvoke();
        const saved = invocation();
        invoke.collection.save(saved);
        try {
            const context = await createTestActionContext();
            await invoke.chainRunner.send(context, saved);
            assert.strictEqual(invoke.chainRunner.getStatus(saved.id)?.state, 'succeeded');
            invoke.collection.save({ ...saved, name: 'Renamed after running' });
            assert.strictEqual((getTreeItem(invoke, saved.id).iconPath as vscode.ThemeIcon).id, 'pass');
            const redirect = { ...saved, request: request({ url: `${invokeServer.baseUrl}/redirect` }) };
            invoke.collection.save(redirect);
            await invoke.chainRunner.send(context, redirect);
            assert.strictEqual(invoke.chainRunner.getStatus(saved.id)?.state, 'failed');
            assert.strictEqual(invoke.chainRunner.getStatus(saved.id)?.statusCode, 302);
            invoke.chainRunner.clear();
            assert.strictEqual(invoke.chainRunner.getStatus(saved.id), undefined);
            assert.strictEqual(getTreeItem(invoke, saved.id).description, 'HTTP Trigger');
        } finally {
            invoke.dispose();
        }
    });

    test('groups invocations into folders without hiding ungrouped requests or changing flat access', () => {
        const invoke = createInvoke();
        const health = { ...invocation(), id: 'group:Posts', name: 'Get health' };
        const createPost = { ...invocation(), id: 'create', name: 'Create post', group: ' Posts ' };
        const getPost = { ...invocation(), id: 'get', name: 'Get post', group: 'Posts' };
        const account = { ...invocation(), id: 'account', name: 'Create account', group: 'Accounts' };
        function shape(elements: (InvocationItem | InvocationGroupItem)[]) {
            return elements.map(element => element instanceof InvocationGroupItem ? { group: element.name } : { id: element.id });
        }
        try {
            invoke.collection.saveAll([health, createPost, account, getPost]);
            const roots = invoke.provider.getChildren();
            assert.deepStrictEqual(shape(roots), [{ id: health.id }, { group: 'Posts' }, { group: 'Accounts' }]);
            assert.deepStrictEqual(shape(invoke.provider.getChildren(roots[1])), [{ id: createPost.id }, { id: getPost.id }]);
            assert.deepStrictEqual(shape(invoke.provider.getChildren(roots[2])), [{ id: account.id }]);
            assert.deepStrictEqual(invoke.provider.getChildren(roots[0]), []);
            assert.strictEqual(invoke.collection.list().length, 4);
            assert.strictEqual(invoke.collection.get(createPost.id)?.group, 'Posts');
            const folder = invoke.provider.getTreeItem(roots[1]);
            assert.strictEqual(folder.label, 'Posts');
            assert.strictEqual(folder.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
            assert.ok(folder.iconPath instanceof vscode.ThemeIcon);
            assert.strictEqual(folder.iconPath.id, 'folder');
            assert.strictEqual(folder.command, undefined);
            assert.notStrictEqual(invoke.provider.getTreeItem(roots[0]).id, folder.id);
            invoke.collection.save({ ...createPost, group: 'Accounts' });
            invoke.collection.save({ ...getPost, group: undefined });
            const regrouped = invoke.provider.getChildren();
            assert.deepStrictEqual(shape(regrouped), [{ id: health.id }, { group: 'Accounts' }, { id: getPost.id }]);
            assert.deepStrictEqual(shape(invoke.provider.getChildren(regrouped[1])), [{ id: createPost.id }, { id: account.id }]);
            invoke.collection.replace([health]);
            assert.deepStrictEqual(shape(invoke.provider.getChildren()), [{ id: health.id }]);
        } finally {
            invoke.dispose();
        }
    });

    test('round trips optional groups without persisting runtime status', async () => {
        const invoke = createInvoke();
        const source = { ...accountChain()[0], group: 'Accounts' };
        const target = { ...accountChain()[1], group: 'Accounts' };
        try {
            for (const invocations of [[invocation()], [source], [source, target]]) {
                invoke.collection.replace(invocations);
                await invoke.chainRunner.send(await createTestActionContext(), invocations[0]);
                const serialized = serializeInvocationCollection(invoke.collection.list());
                assert.deepStrictEqual(parseInvocationCollection(serialized), invocations);
                assert.strictEqual(JSON.parse(serialized).version, invocations.length === 2 ? 2 : 1);
                assert.ok(!serialized.includes('lastRun'));
                assert.ok(!serialized.includes('duration'));
            }
        } finally {
            invoke.dispose();
        }
    });

    test('round trips a versioned collection with all request fields', () => {
        const saved = invocation();
        assert.deepStrictEqual(parseInvocationCollection(serializeInvocationCollection([saved])), [saved]);
        assert.deepStrictEqual(parseInvocationCollection(serializeInvocationCollection([])), []);
    });

    test('rejects invalid collections without replacing existing saved invocations', () => {
        const invoke = createInvoke();
        const saved = invocation();
        invoke.collection.save(saved);
        try {
            for (const invalid of [
                'private-value invalid JSON',
                'null',
                '[]',
                JSON.stringify({ version: 5, invocations: [] }),
                JSON.stringify({ version: 1, invocations: {} }),
                JSON.stringify({ version: 1, invocations: [saved, saved] }),
                JSON.stringify({ version: 1, invocations: [{ ...saved, name: ' ' }] }),
                JSON.stringify({ version: 1, invocations: [{ ...saved, name: 'a\nb' }] }),
                ...[null, 42, '', ' ', 'a\nb', 'a'.repeat(101)].map(group => JSON.stringify({ version: 1, invocations: [{ ...saved, group }] })),
                JSON.stringify({ version: 1, invocations: [{ ...saved, request: { ...saved.request, method: 'TRACE' } }] }),
                JSON.stringify({ version: 1, invocations: [{ ...saved, request: { ...saved.request, body: 'x'.repeat(5 * 1024 * 1024 + 1) } }] }),
            ]) {
                assert.throws(() => invoke.collection.replace(parseInvocationCollection(invalid)), (error: unknown) =>
                    error instanceof Error && !error.message.includes('private-value'));
                assert.deepStrictEqual(invoke.collection.list(), [saved]);
            }
            assert.throws(() => invoke.collection.replace([saved, saved]), /duplicate invocation IDs/);
            assert.deepStrictEqual(invoke.collection.list(), [saved]);
        } finally {
            invoke.dispose();
        }
    });

    test('exports only after confirming plaintext credentials and an existing-file overwrite', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-invoke-'));
        const target = vscode.Uri.file(path.join(directory, 'collection.json'));
        const context = await createTestActionContext();
        const ui = new TestUserInput(vscode);
        context.ui = ui;
        const saved = invocation();
        try {
            const cancelledContext = await createTestActionContext();
            cancelledContext.ui.showWarningMessage = async () => { throw new UserCancelledError(); };
            await assert.rejects(saveCollectionFile(cancelledContext, [saved], target), isUserCancelledError);
            assert.strictEqual(await fs.pathExists(target.fsPath), false);
            await ui.runWithInputs(['Save Collection'], () => saveCollectionFile(context, [saved], target));
            assert.deepStrictEqual(await openCollectionFile(context, target), [saved]);

            const renamed = { ...saved, name: 'Renamed endpoint' };
            await assert.rejects(saveCollectionFile(cancelledContext, [renamed], target), isUserCancelledError);
            assert.deepStrictEqual(await openCollectionFile(context, target), [saved]);
            await ui.runWithInputs(['Save Collection', 'Overwrite'], () => saveCollectionFile(context, [renamed], target));
            assert.deepStrictEqual(await openCollectionFile(context, target), [renamed]);
            await assert.rejects(saveCollectionFile(context, [], target), /Save an invocation/);
        } finally {
            await fs.remove(directory);
        }
    });

    test('batch saving validates the entire dependency graph before changing the collection', () => {
        const invoke = createInvoke();
        const existing = invocation();
        invoke.collection.save(existing);
        let changes = 0;
        const subscription = invoke.provider.onDidChangeTreeData(() => changes++);
        const [source, target] = accountChain();
        try {
            assert.throws(() => invoke.collection.saveAll([source, { ...target, request: { ...target.request, dependsOn: ['missing'] } }]), /prerequisite/);
            assert.throws(() => invoke.collection.saveAll([source, source]), /duplicate/);
            assert.deepStrictEqual(invoke.collection.list(), [existing]);
            assert.strictEqual(changes, 0);
            invoke.collection.saveAll([target, source]);
            assert.strictEqual(changes, 1);
            assert.deepStrictEqual(invoke.collection.list(), [existing, target, source]);
        } finally {
            subscription.dispose();
            invoke.dispose();
        }
    });
});
