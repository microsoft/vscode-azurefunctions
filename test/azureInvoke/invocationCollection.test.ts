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
import { InvocationRunState, type InvocationRunStatus } from '../../src/azureInvoke/invocationRunner/InvocationRunStatus';
import { currentCollectionVersion } from '../../src/azureInvoke/models/collectionSchema';
import { openCollectionFile } from '../../src/commands/azureInvoke/openCollection';
import { saveCollectionFile } from '../../src/commands/azureInvoke/saveCollection';
import { InvocationGroupItem } from '../../src/tree/azureInvoke/InvocationGroupItem';
import { InvocationItem } from '../../src/tree/azureInvoke/InvocationItem';
import { accountChain, createInvoke, getTreeItem, invocation, request, testServer, useInvokeTestServer } from './azureInvokeTestUtils';
import { invokeErrorPatterns } from './invokeTestExpectations';

// Match versioned inputs, including optional trigger suffixes, but not .expected.json files.
const inputFixtureNamePattern = /^v\d+(?:-[\w-]+)?\.json$/;
const collectionErrorPatterns = {
    newerVersion: /newer version/,
    invalidInvocationTags: /invalid invocation or an unsupported trigger or schema version/,
    duplicateInvocationIds: /duplicate invocation IDs/,
    emptyExport: /Save an invocation/,
    credentialExport: /Possible credentials detected.*plain text/i,
    missingPrerequisite: /prerequisite/,
    duplicateBatchEntry: /duplicate/,
};

suite('Azure Invoke collection and tree', () => {
    useInvokeTestServer();

    // ---- Session state and tree display ----

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
        const running = itemWithIcon({ state: InvocationRunState.Running, lastRun }, 'loading~spin');
        assert.strictEqual(running.description, `HTTP Trigger (${lastRun.toLocaleTimeString()})`);
        assert.ok(String(running.tooltip).includes('Running...'));
        for (const [state, statusCode] of [[InvocationRunState.Succeeded, 200], [InvocationRunState.Failed, 302], [InvocationRunState.Failed, 500]] as const) {
            const succeeded = state === InvocationRunState.Succeeded;
            const finished = itemWithIcon({ state, lastRun, statusCode, duration: 12 }, succeeded ? 'pass' : 'error', succeeded ? 'testing.iconPassed' : 'testing.iconFailed');
            assert.strictEqual(finished.description, running.description);
            assert.ok(String(finished.tooltip).includes(`${statusCode}, 12 ms`));
        }
        assert.ok(String(itemWithIcon({ state: InvocationRunState.Failed, lastRun }, 'error', 'testing.iconFailed').tooltip).endsWith('Failed'));
        assert.ok(String(itemWithIcon({ state: InvocationRunState.Cancelled, lastRun }, 'circle-slash').tooltip).endsWith('Cancelled'));
        itemWithIcon({ state: InvocationRunState.Blocked, lastRun }, 'warning', 'problemsWarningIcon.foreground');
    });

    test('run status survives renames, reflects 2xx results only, and resets when the runner is cleared', async () => {
        const invoke = createInvoke();
        const saved = invocation();
        invoke.collection.save(saved);
        try {
            const context = await createTestActionContext();
            await invoke.chainRunner.sendRequest(context, saved);
            assert.strictEqual(invoke.chainRunner.getStatus(saved.id)?.state, 'succeeded');
            invoke.collection.save({ ...saved, name: 'Renamed after running' });
            assert.strictEqual((getTreeItem(invoke, saved.id).iconPath as vscode.ThemeIcon).id, 'pass');
            const redirect = { ...saved, request: request({ url: `${testServer.baseUrl}/redirect` }) };
            invoke.collection.save(redirect);
            await invoke.chainRunner.sendRequest(context, redirect);
            assert.strictEqual(invoke.chainRunner.getStatus(saved.id)?.state, 'failed');
            assert.strictEqual(invoke.chainRunner.getStatus(saved.id)?.statusCode, 302);
            invoke.chainRunner.clear();
            assert.strictEqual(invoke.chainRunner.getStatus(saved.id), undefined);
            assert.strictEqual(getTreeItem(invoke, saved.id).description, 'HTTP Trigger');
        } finally {
            invoke.dispose();
        }
    });

    test('a response that arrives after the runner is cleared is not reused by the next collection', async () => {
        const invoke = createInvoke();
        const source = invocation();
        const dependent = { id: 'dependent', name: 'Dependent', request: request({ dependsOn: [source.id] }) };
        invoke.collection.saveMany([source, dependent]);
        try {
            // Hold the source's response until after clear(), as if it completed despite cancellation.
            let respond!: () => void;
            const responded = new Promise<void>(resolve => respond = resolve);
            invoke.chainRunner.getInvocationRunner(source.id).sendRequest = async () => {
                await responded;
                return { status: 200, duration: 1, headers: [], body: '{}' };
            };

            const lateRun = invoke.chainRunner.sendRequest(await createTestActionContext(), source, { saved: true });
            invoke.chainRunner.clear();
            respond();
            await lateRun;

            await assert.rejects(invoke.chainRunner.sendRequest(await createTestActionContext(), dependent, { saved: true }), invokeErrorPatterns.noSuccessfulPrerequisite);
        } finally {
            invoke.dispose();
        }
    });

    test('lists ungrouped invocations above folders without changing collection order', () => {
        const invoke = createInvoke();
        const health = { ...invocation(), id: 'group:Posts', name: 'Get health' };
        const createPost = { ...invocation(), id: 'create', name: 'Create post', group: ' Posts ' };
        const getPost = { ...invocation(), id: 'get', name: 'Get post', group: 'Posts' };
        const account = { ...invocation(), id: 'account', name: 'Create account', group: 'Accounts' };
        function shape(elements: (InvocationItem | InvocationGroupItem)[]) {
            return elements.map(element => element instanceof InvocationGroupItem ? { group: element.name } : { id: element.id });
        }
        try {
            invoke.collection.saveMany([createPost, health, account, getPost]);
            const roots = invoke.provider.getChildren();
            assert.deepStrictEqual(shape(roots), [{ id: health.id }, { group: 'Posts' }, { group: 'Accounts' }]);
            assert.deepStrictEqual(shape(invoke.provider.getChildren(roots[1])), [{ id: createPost.id }, { id: getPost.id }]);
            assert.deepStrictEqual(shape(invoke.provider.getChildren(roots[2])), [{ id: account.id }]);
            assert.deepStrictEqual(invoke.provider.getChildren(roots[0]), []);
            assert.deepStrictEqual(invoke.collection.list().map(item => item.id), [createPost.id, health.id, account.id, getPost.id]);
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
            assert.deepStrictEqual(shape(regrouped), [{ id: health.id }, { id: getPost.id }, { group: 'Accounts' }]);
            assert.deepStrictEqual(shape(invoke.provider.getChildren(regrouped[2])), [{ id: createPost.id }, { id: account.id }]);
            invoke.collection.replaceAll([health]);
            assert.deepStrictEqual(shape(invoke.provider.getChildren()), [{ id: health.id }]);
        } finally {
            invoke.dispose();
        }
    });

    // ---- Collection file format and export ----

    test('round trips optional groups without persisting runtime status', async () => {
        const invoke = createInvoke();
        const source = { ...accountChain()[0], group: 'Accounts' };
        const target = { ...accountChain()[1], group: 'Accounts' };
        try {
            for (const invocations of [[invocation()], [source], [source, target]]) {
                invoke.collection.replaceAll(invocations);
                await invoke.chainRunner.sendRequest(await createTestActionContext(), invocations[0]);
                const serialized = serializeInvocationCollection(invoke.collection.list());
                assert.deepStrictEqual(parseInvocationCollection(serialized), invocations);
                assert.strictEqual(JSON.parse(serialized).version, currentCollectionVersion);
                assert.ok(!serialized.includes('lastRun'));
                assert.ok(!serialized.includes('duration'));
            }
        } finally {
            invoke.dispose();
        }
    });

    test('every saved collection format version still loads and saves as the current format', async () => {
        // See test/azureInvoke/fixtures/collections/README.md. Each vN.json must turn into its vN.expected.json.
        const fixturesDirectory = path.join(__dirname, 'fixtures', 'collections');
        const inputFixtureNames = (await fs.readdir(fixturesDirectory)).filter(file => inputFixtureNamePattern.test(file));
        assert.ok(inputFixtureNames.length > 0);
        assert.ok(inputFixtureNames.includes(`v${currentCollectionVersion}.json`), 'Add a fixture for the current collection format version.');

        for (const inputFixtureName of inputFixtureNames) {
            const inputJson = await fs.readFile(path.join(fixturesDirectory, inputFixtureName), 'utf8');
            const roundTrippedCollection = JSON.parse(serializeInvocationCollection(parseInvocationCollection(inputJson)));
            const expectedFixtureName = inputFixtureName.replace('.json', '.expected.json');
            const expectedJson = await fs.readFile(path.join(fixturesDirectory, expectedFixtureName), 'utf8');
            assert.strictEqual(roundTrippedCollection.version, currentCollectionVersion, inputFixtureName);
            assert.deepStrictEqual(roundTrippedCollection, JSON.parse(expectedJson), inputFixtureName);
        }

        // A newer file is refused rather than partly read, so this build can't drop fields it doesn't know.
        assert.throws(() => parseInvocationCollection(JSON.stringify({ version: currentCollectionVersion + 1, invocations: [] })), collectionErrorPatterns.newerVersion);
    });

    test('round trips a versioned collection with all request fields', () => {
        const saved = invocation();
        assert.deepStrictEqual(parseInvocationCollection(serializeInvocationCollection([saved])), [saved]);
        assert.deepStrictEqual(parseInvocationCollection(serializeInvocationCollection([])), []);
    });

    test('rejects a whole collection when an entry has missing or unsupported version tags', () => {
        const supported = { ...invocation(), trigger: 'http', schemaVersion: 1 };
        for (const tags of [
            {},
            { trigger: 'http' },
            { schemaVersion: 1 },
            { trigger: 'timer', schemaVersion: 1 },
            { trigger: 'http', schemaVersion: 2 },
            { trigger: 'http', schemaVersion: '1' },
        ]) {
            const unsupported = { ...invocation(), ...tags };
            assert.throws(
                () => parseInvocationCollection(JSON.stringify({ version: 1, invocations: [supported, unsupported] })),
                collectionErrorPatterns.invalidInvocationTags,
            );
        }
    });

    test('rejects invalid collections without replacing existing saved invocations', () => {
        const invoke = createInvoke();
        const saved = invocation();
        invoke.collection.save(saved);
        const entry = { ...saved, trigger: 'http', schemaVersion: 1 };
        try {
            for (const invalid of [
                'private-value invalid JSON',
                'null',
                '[]',
                JSON.stringify({ version: currentCollectionVersion + 1, invocations: [] }),
                JSON.stringify({ version: 1, invocations: {} }),
                JSON.stringify({ version: 1, invocations: [entry, entry] }),
                JSON.stringify({ version: 1, invocations: [{ ...entry, name: ' ' }] }),
                JSON.stringify({ version: 1, invocations: [{ ...entry, name: 'a\nb' }] }),
                ...[null, 42, '', ' ', 'a\nb', 'a'.repeat(101)].map(group => JSON.stringify({ version: 1, invocations: [{ ...entry, group }] })),
                JSON.stringify({ version: 1, invocations: [{ ...entry, request: { ...entry.request, method: 'TRACE' } }] }),
                JSON.stringify({ version: 1, invocations: [{ ...entry, request: { ...entry.request, body: 'x'.repeat(5 * 1024 * 1024 + 1) } }] }),
            ]) {
                assert.throws(() => invoke.collection.replaceAll(parseInvocationCollection(invalid)), (error: unknown) =>
                    error instanceof Error && !error.message.includes('private-value'));
                assert.deepStrictEqual(invoke.collection.list(), [saved]);
            }
            assert.throws(() => invoke.collection.replaceAll([saved, saved]), collectionErrorPatterns.duplicateInvocationIds);
            assert.deepStrictEqual(invoke.collection.list(), [saved]);
        } finally {
            invoke.dispose();
        }
    });

    test('exports a clean collection without a warning and still confirms overwrites', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-invoke-'));
        const target = vscode.Uri.file(path.join(directory, 'collection.json'));
        const context = await createTestActionContext();
        const ui = new TestUserInput(vscode);
        context.ui = ui;
        const saved = { ...invocation(), request: request() };
        try {
            const cancelledContext = await createTestActionContext();
            cancelledContext.ui.showWarningMessage = async () => { throw new UserCancelledError(); };
            await ui.runWithInputs([], () => saveCollectionFile(context, [saved], target));
            assert.deepStrictEqual(await openCollectionFile(context, target), [saved]);

            const renamed = { ...saved, name: 'Renamed endpoint' };
            await assert.rejects(saveCollectionFile(cancelledContext, [renamed], target), isUserCancelledError);
            assert.deepStrictEqual(await openCollectionFile(context, target), [saved]);
            await ui.runWithInputs(['Overwrite'], () => saveCollectionFile(context, [renamed], target));
            assert.deepStrictEqual(await openCollectionFile(context, target), [renamed]);
            await assert.rejects(saveCollectionFile(context, [], target), collectionErrorPatterns.emptyExport);
        } finally {
            await fs.remove(directory);
        }
    });

    test('warns about suspected credentials and writes only after Save Anyway', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-invoke-'));
        const target = vscode.Uri.file(path.join(directory, 'collection.json'));
        const context = await createTestActionContext();
        const sampleSecret = 'example-only-secret';
        const ui = new TestUserInput(vscode);
        context.ui = ui;
        const cleanInvocation = { ...invocation(), id: 'health-check', request: request() };
        const cancelledContext = await createTestActionContext();
        cancelledContext.ui.showWarningMessage = async (message) => {
            assert.match(message, collectionErrorPatterns.credentialExport);
            assert.ok(message.includes('invocation 2'));
            assert.ok(!message.includes(sampleSecret));
            throw new UserCancelledError();
        };
        const credentialRequests = [
            request({ headers: [{ name: 'aUtHoRiZaTiOn', value: `Bearer {{token}}-${sampleSecret}`, enabled: false }] }),
            request({ headers: [{ name: 'x-functions-key', value: sampleSecret }] }),
            request({ headers: [{ name: 'Cookie', value: `session=${sampleSecret}` }] }),
            request({ query: [{ name: 'api_key', value: sampleSecret, enabled: false }] }),
            request({ url: `${testServer.baseUrl}/echo?%63ode=${sampleSecret}` }),
            request({ url: `http://user:${sampleSecret}@localhost/echo` }),
            request({ method: 'POST', body: JSON.stringify({ account: [{ password: sampleSecret }] }) }),
            request({
                method: 'POST',
                headers: [{ name: 'Content-Type', value: 'application/x-www-form-urlencoded' }],
                body: `client_secret=${sampleSecret}`,
            }),
        ];
        try {
            for (const credentialRequest of credentialRequests) {
                const saved = { ...invocation(), request: credentialRequest };
                await assert.rejects(saveCollectionFile(cancelledContext, [cleanInvocation, saved], target), isUserCancelledError);
                assert.strictEqual(await fs.pathExists(target.fsPath), false);
            }

            const previousContent = 'existing collection';
            await fs.writeFile(target.fsPath, previousContent);
            const saved = { ...invocation(), request: credentialRequests[0] };
            const invocations = [cleanInvocation, saved];
            await assert.rejects(saveCollectionFile(cancelledContext, invocations, target), isUserCancelledError);
            assert.strictEqual(await fs.readFile(target.fsPath, 'utf8'), previousContent);
            await ui.runWithInputs(['Save Anyway', 'Overwrite'], () => saveCollectionFile(context, invocations, target));
            assert.deepStrictEqual(await openCollectionFile(context, target), invocations);
        } finally {
            await fs.remove(directory);
        }
    });

    test('exports credential bindings and generated test passwords without resolving them', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-invoke-'));
        const target = vscode.Uri.file(path.join(directory, 'collection.json'));
        const context = await createTestActionContext();
        const ui = new TestUserInput(vscode);
        context.ui = ui;
        const [register, protectedRequest] = accountChain();
        register.request.body = '{"password":"Example-{{guid}}-Aa1!"}';
        const signIn = {
            id: 'sign-in', name: 'Sign in', request: request({
                method: 'POST',
                body: '{"password":"{{password}}"}',
                bindings: [{ name: 'password', sourceId: register.id, pointer: '/request/body/password' }],
            }),
        };
        protectedRequest.request.headers = [{ name: 'Authorization', value: 'Bearer {{token}}' }];
        protectedRequest.request.bindings?.push({ name: 'token', sourceId: signIn.id, pointer: '/body/accessToken' });
        const invocations = [register, signIn, protectedRequest];

        try {
            await ui.runWithInputs([], () => saveCollectionFile(context, invocations, target));
            assert.deepStrictEqual(await openCollectionFile(context, target), invocations);
        } finally {
            await fs.remove(directory);
        }
    });

    // ---- Atomic collection updates ----

    test('batch saving validates the entire dependency graph before changing the collection', () => {
        const invoke = createInvoke();
        const existing = invocation();
        invoke.collection.save(existing);
        let changes = 0;
        const subscription = invoke.provider.onDidChangeTreeData(() => changes++);
        const [source, target] = accountChain();
        try {
            assert.throws(() => invoke.collection.saveMany([source, { ...target, request: { ...target.request, dependsOn: ['missing'] } }]), collectionErrorPatterns.missingPrerequisite);
            assert.throws(() => invoke.collection.saveMany([source, source]), collectionErrorPatterns.duplicateBatchEntry);
            assert.deepStrictEqual(invoke.collection.list(), [existing]);
            assert.strictEqual(changes, 0);
            invoke.collection.saveMany([target, source]);
            assert.strictEqual(changes, 1);
            assert.deepStrictEqual(invoke.collection.list(), [existing, target, source]);
        } finally {
            subscription.dispose();
            invoke.dispose();
        }
    });
});
