/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { type HttpInvocation, type HttpRequestStateMessage } from '../../webviews/azureInvoke/shared/httpRequest';
import { copyInvocation, planInvocationChain, validateInvocation } from './invocationCollection';

export type AzureInvokeTreeElement = HttpInvocation | { readonly group: string };
export const invocationRunStatuses = ['notRun', 'running', 'succeeded', 'failed', 'blocked', 'cancelled'] as const;

export class AzureInvokeTreeDataProvider implements vscode.TreeDataProvider<AzureInvokeTreeElement>, vscode.Disposable {
    private readonly requests = new Map<string, HttpInvocation>();
    private readonly statuses = new Map<string, {
        text: string; icon: string; color?: string; lastRun: Date;
        status: typeof invocationRunStatuses[number]; statusCode?: number; duration?: number;
    }>();
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
                {
                    text: localize('azureInvoke.resultStatus', '{0}, {1} ms', message.response.status, message.response.duration),
                    ...(message.response.status >= 200 && message.response.status < 300 ?
                        { icon: 'pass', color: 'testing.iconPassed' } : { icon: 'error', color: 'testing.iconFailed' }),
                } :
                message.blocked ?
                    { text: localize('azureInvoke.requestBlocked', 'Not run: a prerequisite has no successful result'), icon: 'warning', color: 'problemsWarningIcon.foreground' } :
                message.cancelled ?
                    { text: localize('azureInvoke.requestCancelled', 'Cancelled'), icon: 'circle-slash' } :
                    { text: localize('azureInvoke.requestFailedStatus', 'Failed'), icon: 'error', color: 'testing.iconFailed' };
        const lastRun = message.command === 'requestStarted' ? new Date() : this.statuses.get(id)?.lastRun ?? new Date();
        const runStatus = message.command === 'requestStarted' ? 'running' :
            message.command === 'response' ? (message.response.status >= 200 && message.response.status < 300 ? 'succeeded' : 'failed') :
                message.blocked ? 'blocked' : message.cancelled ? 'cancelled' : 'failed';
        this.statuses.set(id, {
            ...status, lastRun, status: runStatus,
            ...(message.command === 'response' ? { statusCode: message.response.status, duration: message.response.duration } : {}),
        });
        this.changeEmitter.fire();
    }

    public getRequestStatus(id: string): string {
        return this.statuses.get(id)?.text ?? localize('azureInvoke.ready', 'Ready');
    }

    public getRequestRunStatus(id: string) {
        const result = this.statuses.get(id);
        return {
            status: result?.status ?? 'notRun',
            ...(result ? { lastRunAt: result.lastRun.toISOString() } : {}),
            ...(result?.statusCode === undefined ? {} : { statusCode: result.statusCode, duration: result.duration }),
        };
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

    public getRequests(): HttpInvocation[] {
        return [...this.requests.values()];
    }

    public getChildren(element?: AzureInvokeTreeElement): AzureInvokeTreeElement[] {
        if (element) {
            return 'request' in element ? [] : this.getRequests().filter(request => request.group === element.group);
        }
        const groups = new Set<string>();
        return this.getRequests().flatMap((request): AzureInvokeTreeElement[] => {
            if (!request.group) {
                return [request];
            }
            if (groups.has(request.group)) {
                return [];
            }
            groups.add(request.group);
            return [{ group: request.group }];
        });
    }

    public getTreeItem(request: AzureInvokeTreeElement): vscode.TreeItem {
        if (!('request' in request)) {
            const item = new vscode.TreeItem(request.group, vscode.TreeItemCollapsibleState.Expanded);
            item.id = `group:${request.group}`;
            item.iconPath = new vscode.ThemeIcon('folder');
            return item;
        }
        const item = new vscode.TreeItem(request.name, vscode.TreeItemCollapsibleState.None);
        item.id = `request:${request.id}`;
        const status = this.statuses.get(request.id);
        item.iconPath = status ? new vscode.ThemeIcon(status.icon, status.color ? new vscode.ThemeColor(status.color) : undefined) : new vscode.ThemeIcon('circle-outline');
        item.description = status?.lastRun.toLocaleString();
        item.tooltip = status ?
            `${localize('azureInvoke.lastRun', 'Last run: {0}', status.lastRun.toLocaleString())}\n${status.text}` :
            localize('azureInvoke.notRun', 'Not run yet');
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
