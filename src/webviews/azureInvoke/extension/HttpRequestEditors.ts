/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { type HttpInvocation } from '../shared/httpRequest';
import { HttpRequestController } from './HttpRequestController';
import { HttpInvocationRunner } from './HttpInvocationRunner';

export class HttpRequestEditors implements vscode.Disposable {
    private readonly controllers = new Map<string, HttpRequestController>();
    private readonly execution: HttpInvocationRunner;
    private readonly subscription: vscode.Disposable;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly provider: AzureInvokeTreeDataProvider,
    ) {
        this.execution = new HttpInvocationRunner(id => provider.getRequest(id), (id, message) => provider.updateRequestStatus(id, message));
        this.subscription = provider.onDidChangeTreeData(() => {
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
        const controller = new HttpRequestController(this.context, invocation, saved, snapshot => this.provider.saveRequest(snapshot), {
            runner: this.execution.getRunner(invocation.id),
            sources: this.getSources(invocation.id),
            execute: (context, request, options) => this.execution.send(context, { ...invocation, request }, options),
        });
        this.controllers.set(invocation.id, controller);
        controller.onDisposed(() => {
            this.controllers.delete(invocation.id);
            if (!this.provider.getRequest(invocation.id)) {
                this.execution.cancel(invocation.id);
            }
        });
        return controller;
    }

    public async sendRequest(context: IActionContext, invocation: HttpInvocation, signal?: AbortSignal, runDependencies = false) {
        return await this.execution.send(context, invocation, { signal, saved: true, runDependencies });
    }

    public canShareResponse(invocation: HttpInvocation): boolean {
        return this.execution.canShareResponse(invocation);
    }

    private getSources(id: string) {
        return this.provider.getChildren().filter(source => source.id !== id).map(({ id, name }) => ({ id, name }));
    }

    public closeAll(): void {
        for (const controller of this.controllers.values()) {
            controller.panel.dispose();
        }
        this.execution.clear();
    }

    public dispose(): void {
        this.closeAll();
        this.subscription.dispose();
    }
}
