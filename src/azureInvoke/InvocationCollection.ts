/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { localize } from '../localize';
import { copyInvocation, validateInvocation, validateInvocations } from './httpInvocation';
import { type HttpInvocation } from './models/httpSchema';

/**
 * Saved invocation definitions for this VS Code session.
 * Every read and write goes through a copy, so callers can never change a stored invocation by reference.
 * Each change is validated as a whole before anything is stored, so the collection is never left invalid.
 */
export class InvocationCollection implements vscode.Disposable {
    /** Saved invocations by ID */
    private readonly invocations = new Map<string, HttpInvocation>();
    /** Numbers default draft names, so each new draft in this session gets a distinct name. */
    private draftNumber = 0;

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeEmitter.event;


    /**
     * Returns a new, unsaved invocation with a unique ID and default values. It isn't stored until it's saved.
     */
    public createDraft(): HttpInvocation {
        return {
            id: randomUUID(),
            name: localize('azureInvoke.httpRequest', 'HTTP request {0}', ++this.draftNumber),
            request: { method: 'GET', url: '', headers: [], query: [], body: '' },
        };
    }

    /**
     * Returns a copy of the saved invocation, or undefined if no invocation has that ID.
     */
    public get(id: string): HttpInvocation | undefined {
        const invocation = this.invocations.get(id);
        return invocation && copyInvocation(invocation);
    }

    /**
     * Returns copies of every saved invocation.
     */
    public list(): HttpInvocation[] {
        return [...this.invocations.values()].map(copyInvocation);
    }

    /**
     * Adds `invocation`, or updates the saved invocation with the same ID. Every other invocation is kept.
     * Throws without changing anything if the collection would become invalid.
     */
    public save(invocation: HttpInvocation): void {
        this.saveMany([invocation]);
    }

    /**
     * Adds or updates each of `invocations`, matched by ID. Every other invocation is kept.
     * Use `replaceAll` to remove the rest instead.
     *
     * Saving several together lets invocations that depend on each other be added in one step.
     * Throws without changing anything if the collection would become invalid.
     */
    public saveMany(invocations: readonly HttpInvocation[]): void {
        // Check each invocation on its own, then store copies so later edits by the caller can't reach them.
        invocations.forEach(validateInvocation);
        const snapshots = invocations.map(copyInvocation);
        if (new Set(snapshots.map(invocation => invocation.id)).size !== snapshots.length) {
            throw new Error(localize('azureInvoke.duplicateInvocation', 'The collection contains duplicate invocation IDs.'));
        }

        // Check the collection as it would be after the save, keeping every invocation not being saved:
        // unique IDs, no cycles, and no missing prerequisites.
        const combined = new Map(this.invocations);
        snapshots.forEach(invocation => combined.set(invocation.id, invocation));
        validateInvocations([...combined.values()]);

        // Everything passed, so store the changes. Updating an existing ID keeps its place in `list()`.
        snapshots.forEach(invocation => this.invocations.set(invocation.id, invocation));
        this.onDidChangeEmitter.fire();
    }

    /**
     * Removes every saved invocation and stores `invocations` in their place, for example when opening a collection file.
     * Use `save` or `saveMany` to keep the others instead.
     * Throws without changing anything if the new invocations are invalid.
     */
    public replaceAll(invocations: readonly HttpInvocation[]): void {
        // Check the new invocations on their own and as a whole before touching the current collection.
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
