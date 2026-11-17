/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type ChainInvocationRunner } from '../../../azureInvoke/ChainInvocationRunner';
import { type InvocationCollection } from '../../../azureInvoke/InvocationCollection';
import { type HttpInvocation, type InvocationSource } from '../shared/httpRequest';
import { InvocationEditor } from './InvocationEditor';

/** The open invocation editor tabs, at most one per invocation. Wires each tab's Save to the collection and Send to the chain runner. */
export class InvocationEditorManager implements vscode.Disposable {
    private readonly editors = new Map<string, InvocationEditor>();
    private readonly subscription: vscode.Disposable;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly collection: InvocationCollection,
        private readonly chainRunner: ChainInvocationRunner,
    ) {
        this.subscription = collection.onDidChange(() => {
            for (const [id, editor] of this.editors) {
                editor.updateSources(this.getSources(id));
            }
        });
    }

    public get size(): number {
        return this.editors.size;
    }

    public open(invocation: HttpInvocation, saved: boolean): InvocationEditor {
        const existing = this.editors.get(invocation.id);
        if (existing) {
            existing.revealToForeground(vscode.ViewColumn.Active);
            return existing;
        }
        const editor = new InvocationEditor(this.context, invocation, saved, snapshot => this.collection.save(snapshot), {
            runner: this.chainRunner.getInvocationRunner(invocation.id),
            sources: this.getSources(invocation.id),
            execute: (context, request, options) => this.chainRunner.send(context, { ...invocation, request }, options),
        });
        this.editors.set(invocation.id, editor);
        editor.onDisposed(() => {
            this.editors.delete(invocation.id);
            if (!this.collection.get(invocation.id)) {
                this.chainRunner.cancel(invocation.id);
            }
        });
        return editor;
    }

    public closeAll(): void {
        for (const editor of this.editors.values()) {
            editor.panel.dispose();
        }
    }

    private getSources(id: string): InvocationSource[] {
        return this.collection.list().filter(source => source.id !== id).map(({ id, name }) => ({ id, name }));
    }

    public dispose(): void {
        this.closeAll();
        this.subscription.dispose();
    }
}
