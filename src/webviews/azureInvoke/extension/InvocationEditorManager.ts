/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type ChainInvocationRunner } from '../../../azureInvoke/invocationRunner/ChainInvocationRunner';
import { type InvocationCollection } from '../../../azureInvoke/InvocationCollection';
import { type HttpInvocation } from '../../../azureInvoke/models/httpSchema';
import { type InvocationSource } from '../shared/invocationEditorProtocol';
import { InvocationEditor } from './InvocationEditor';

/**
 * The open invocation editor tabs, at most one per invocation.
 * Wires each tab's Save to the collection and Send to the chain runner, and keeps each tab's dependency picker
 * in step with the collection.
 */
export class InvocationEditorManager implements vscode.Disposable {
    /** Open tabs by invocation ID. */
    private readonly editors = new Map<string, InvocationEditor>();
    /** Listens for collection changes to refresh every tab's dependency picker. */
    private readonly subscription: vscode.Disposable;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly collection: InvocationCollection,
        private readonly chainRunner: ChainInvocationRunner,
    ) {
        // A saved, renamed, or removed invocation changes what every other tab can link to.
        this.subscription = collection.onDidChange(() => {
            for (const [id, editor] of this.editors) {
                editor.updateSources(this.getSources(id));
            }
        });
    }

    /**
     * Number of open tabs.
     */
    public get size(): number {
        return this.editors.size;
    }

    /**
     * Opens a tab for `invocation`, which may be a new draft or a saved invocation.
     * If the invocation already has a tab, brings that tab forward instead, keeping its unsaved edits.
     */
    public open(invocation: HttpInvocation, saved: boolean): InvocationEditor {
        const existing = this.editors.get(invocation.id);
        if (existing) {
            existing.revealToForeground(vscode.ViewColumn.Active);
            return existing;
        }

        // Share the chain runner's runner for this invocation, so a run started anywhere shows in this tab.
        const editor = new InvocationEditor(this.context, invocation, saved, snapshot => this.collection.save(snapshot), {
            runner: this.chainRunner.getInvocationRunner(invocation.id),
            sources: this.getSources(invocation.id),
            execute: (context, request, options) => this.chainRunner.sendRequest(context, { ...invocation, request }, options),
        });
        this.editors.set(invocation.id, editor);

        editor.onDisposed(() => {
            this.editors.delete(invocation.id);
            // An unsaved draft has no tree item, so nothing else could show or cancel its run after the tab closes.
            if (!this.collection.get(invocation.id)) {
                this.chainRunner.cancel(invocation.id);
            }
        });

        return editor;
    }

    /**
     * Closes every open tab, for example before a different collection is opened.
     */
    public closeAll(): void {
        for (const editor of this.editors.values()) {
            editor.panel.dispose();
        }
    }

    public dispose(): void {
        this.closeAll();
        this.subscription.dispose();
    }

    /**
     * Returns the invocations the tab for `id` can link to: every saved invocation except itself.
     * Longer cycles are rejected when the collection saves.
     */
    private getSources(id: string): InvocationSource[] {
        return this.collection.list().filter(source => source.id !== id).map(({ id, name }) => ({ id, name }));
    }
}
