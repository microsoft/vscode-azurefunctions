/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type HttpInvocationRunner } from '../../../azureInvoke/HttpInvocationRunner';
import { type InvocationCollection } from '../../../azureInvoke/InvocationCollection';
import { type HttpInvocation, type InvocationSource } from '../shared/httpRequest';
import { HttpRequestController } from './HttpRequestController';

/** Tracks the open invocation editors, one per invocation. */
export class HttpRequestEditors implements vscode.Disposable {
    private readonly controllers = new Map<string, HttpRequestController>();
    private readonly subscription: vscode.Disposable;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly collection: InvocationCollection,
        private readonly runner: HttpInvocationRunner,
    ) {
        this.subscription = collection.onDidChange(() => {
            for (const [id, controller] of this.controllers) {
                controller.updateSources(this.getSources(id));
            }
        });
    }

    public get size(): number {
        return this.controllers.size;
    }

    public open(invocation: HttpInvocation, saved: boolean): HttpRequestController {
        const existing = this.controllers.get(invocation.id);
        if (existing) {
            existing.revealToForeground(vscode.ViewColumn.Active);
            return existing;
        }
        const controller = new HttpRequestController(this.context, invocation, saved, snapshot => this.collection.save(snapshot), {
            runner: this.runner.getRunner(invocation.id),
            sources: this.getSources(invocation.id),
            execute: (context, request, options) => this.runner.send(context, { ...invocation, request }, options),
        });
        this.controllers.set(invocation.id, controller);
        controller.onDisposed(() => {
            this.controllers.delete(invocation.id);
            if (!this.collection.get(invocation.id)) {
                this.runner.cancel(invocation.id);
            }
        });
        return controller;
    }

    public closeAll(): void {
        for (const controller of this.controllers.values()) {
            controller.panel.dispose();
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
