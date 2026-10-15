/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { type HttpInvocation } from '../shared/httpRequest';
import { HttpRequestController } from './HttpRequestController';

export class HttpRequestEditors implements vscode.Disposable {
    private readonly controllers = new Map<string, HttpRequestController>();

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly provider: AzureInvokeTreeDataProvider,
    ) {
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
        const controller = new HttpRequestController(this.context, invocation, saved, snapshot => this.provider.saveRequest(snapshot));
        this.controllers.set(invocation.id, controller);
        controller.onDisposed(() => this.controllers.delete(invocation.id));
        return controller;
    }

    public closeAll(): void {
        for (const controller of this.controllers.values()) {
            controller.panel.dispose();
        }
    }

    public dispose(): void {
        this.closeAll();
    }
}
