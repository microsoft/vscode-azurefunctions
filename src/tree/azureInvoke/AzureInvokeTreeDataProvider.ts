/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { type HttpInvocation, type HttpRequestStateMessage } from '../../webviews/azureInvoke/shared/httpRequest';
import { copyInvocation, planInvocationChain, validateInvocation } from './invocationCollection';

export class AzureInvokeTreeDataProvider implements vscode.TreeDataProvider<HttpInvocation>, vscode.Disposable {
    private readonly requests = new Map<string, HttpInvocation>();
    private readonly statuses = new Map<string, { text: string; icon: string }>();
    private readonly changeEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeTreeData = this.changeEmitter.event;
    private requestNumber = 0;

    public createRequest(): HttpInvocation {
        return {
            id: randomUUID(),
            name: localize('azureInvoke.httpRequest', 'HTTP request {0}', ++this.requestNumber),
            request: { method: 'GET', url: '', headers: [], query: [], body: '' },
        };
    }

    public saveRequest(invocation: HttpInvocation): void {
        this.saveRequests([invocation]);
    }

    public saveRequests(invocations: readonly HttpInvocation[]): void {
        invocations.forEach(validateInvocation);
        if (new Set(invocations.map(invocation => invocation.id)).size !== invocations.length) {
            throw new Error(localize('azureInvoke.duplicateInvocation', 'The collection contains duplicate invocation IDs.'));
        }
        const snapshots = invocations.map(copyInvocation);
        const combined = new Map(this.requests);
        snapshots.forEach(invocation => combined.set(invocation.id, invocation));
        snapshots.forEach(invocation => planInvocationChain(invocation, id => combined.get(id)));
        for (const invocation of snapshots) {
            this.requests.set(invocation.id, invocation);
            this.statuses.delete(invocation.id);
        }
        this.changeEmitter.fire();
    }

    public updateRequestStatus(id: string, message: HttpRequestStateMessage): void {
        if (!this.requests.has(id)) {
            return;
        }
        const status = message.command === 'requestStarted' ?
            { text: localize('azureInvoke.running', 'Running...'), icon: 'loading~spin' } :
            message.command === 'response' ?
                { text: localize('azureInvoke.resultStatus', '{0}, {1} ms', message.response.status, message.response.duration), icon: message.response.status >= 400 ? 'warning' : 'circle-filled' } :
                message.cancelled ?
                    { text: localize('azureInvoke.requestCancelled', 'Cancelled'), icon: 'circle-slash' } :
                    { text: localize('azureInvoke.requestFailedStatus', 'Failed'), icon: 'error' };
        this.statuses.set(id, status);
        this.changeEmitter.fire();
    }

    public getRequestStatus(id: string): string {
        return this.statuses.get(id)?.text ?? localize('azureInvoke.ready', 'Ready');
    }

    public getRequest(id: string): HttpInvocation | undefined {
        const invocation = this.requests.get(id);
        return invocation && copyInvocation(invocation);
    }

    public replaceRequests(invocations: readonly HttpInvocation[]): void {
        invocations.forEach(validateInvocation);
        for (const invocation of invocations) {
            planInvocationChain(invocation, id => invocations.find(source => source.id === id));
        }
        if (new Set(invocations.map(invocation => invocation.id)).size !== invocations.length) {
            throw new Error(localize('azureInvoke.duplicateInvocation', 'The collection contains duplicate invocation IDs.'));
        }
        this.requests.clear();
        this.statuses.clear();
        for (const invocation of invocations) {
            this.requests.set(invocation.id, copyInvocation(invocation));
        }
        this.changeEmitter.fire();
    }

    public getChildren(element?: HttpInvocation): HttpInvocation[] {
        return element ? [] : [...this.requests.values()];
    }

    public getTreeItem(request: HttpInvocation): vscode.TreeItem {
        const item = new vscode.TreeItem(request.name, vscode.TreeItemCollapsibleState.None);
        item.id = request.id;
        item.iconPath = new vscode.ThemeIcon('globe');
        item.description = this.getRequestStatus(request.id);
        const status = this.statuses.get(request.id);
        if (status) {
            item.iconPath = new vscode.ThemeIcon(status.icon);
        }
        item.command = {
            command: 'azureFunctions.azureInvoke.open',
            title: localize('azureInvoke.open', 'Open HTTP Request'),
            arguments: [{ id: request.id }],
        };
        return item;
    }

    public dispose(): void {
        this.requests.clear();
        this.statuses.clear();
        this.changeEmitter.dispose();
    }
}
