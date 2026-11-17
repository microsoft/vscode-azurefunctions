/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { localize } from '../localize';
import { type HttpInvocation } from '../webviews/azureInvoke/shared/httpRequest';
import { copyInvocation, validateInvocation, validateInvocations } from './httpInvocation';

/**
 * The invocations saved for this VS Code session: what to send, not what happened.
 * Every save is validated as a whole, and callers always get copies, so unsaved edits never leak in.
 */
export class InvocationCollection implements vscode.Disposable {
    private readonly invocations = new Map<string, HttpInvocation>();
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeEmitter.event;
    private draftNumber = 0;

    /** Creates an unsaved invocation with a unique ID and default name. */
    public createDraft(): HttpInvocation {
        return {
            id: randomUUID(),
            name: localize('azureInvoke.httpRequest', 'HTTP request {0}', ++this.draftNumber),
            request: { method: 'GET', url: '', headers: [], query: [], body: '' },
        };
    }

    public get(id: string): HttpInvocation | undefined {
        const invocation = this.invocations.get(id);
        return invocation && copyInvocation(invocation);
    }

    public list(): HttpInvocation[] {
        return [...this.invocations.values()].map(copyInvocation);
    }

    public save(invocation: HttpInvocation): void {
        this.saveAll([invocation]);
    }

    /** Adds or updates invocations only if the resulting collection stays valid. */
    public saveAll(invocations: readonly HttpInvocation[]): void {
        invocations.forEach(validateInvocation);
        const snapshots = invocations.map(copyInvocation);
        if (new Set(snapshots.map(invocation => invocation.id)).size !== snapshots.length) {
            throw new Error(localize('azureInvoke.duplicateInvocation', 'The collection contains duplicate invocation IDs.'));
        }
        const combined = new Map(this.invocations);
        snapshots.forEach(invocation => combined.set(invocation.id, invocation));
        validateInvocations([...combined.values()]);
        snapshots.forEach(invocation => this.invocations.set(invocation.id, invocation));
        this.onDidChangeEmitter.fire();
    }

    public replace(invocations: readonly HttpInvocation[]): void {
        invocations.forEach(validateInvocation);
        const snapshots = invocations.map(copyInvocation);
        validateInvocations(snapshots);
        this.invocations.clear();
        snapshots.forEach(invocation => this.invocations.set(invocation.id, invocation));
        this.onDidChangeEmitter.fire();
    }

    public dispose(): void {
        this.invocations.clear();
        this.onDidChangeEmitter.dispose();
    }
}
