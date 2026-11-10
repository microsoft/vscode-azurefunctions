/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { localize } from '../../localize';
import { isHttpInvocation, type HttpInvocation, type HttpRequestStateMessage } from '../../webviews/azureInvoke/shared/httpRequest';
import { copyBlobInvocation, isBlobInvocation, type BlobInvocation, type BlobUploadState, type Invocation } from '../../webviews/azureInvoke/shared/blobInvocation';
import { copyTimerInvocation, isTimerInvocation, type TimerInvocation, type TimerInvocationState } from '../../webviews/azureInvoke/shared/timerInvocation';
import { copyCollectionInvocation, copyInvocation, planInvocationChain, validateCollectionInvocation } from './invocationCollection';

export type AzureInvokeTreeElement = Invocation | { readonly group: string };
export const invocationRunStatuses = ['notRun', 'running', 'succeeded', 'failed', 'blocked', 'cancelled'] as const;

export class AzureInvokeTreeDataProvider implements vscode.TreeDataProvider<AzureInvokeTreeElement>, vscode.Disposable {
    private readonly requests = new Map<string, Invocation>();
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

    public createBlobInvocation(): BlobInvocation {
        return {
            id: randomUUID(), name: localize('azureInvoke.blobInvocation', 'Blob upload {0}', ++this.requestNumber), trigger: 'blob',
            request: {
                target: { kind: 'azurite', url: 'http://127.0.0.1:10000/devstoreaccount1' },
                container: '', blobName: '', content: '', encoding: 'base64', contentType: 'application/octet-stream',
            },
        };
    }

    public createTimerInvocation(): TimerInvocation {
        return {
            id: randomUUID(), name: localize('azureInvoke.timerInvocation', 'Timer invocation {0}', ++this.requestNumber), trigger: 'timer',
            request: { hostUrl: 'http://localhost:7071', functionName: '', schedule: '' },
        };
    }

    public saveRequest(invocation: Invocation): void {
        this.saveRequests([invocation]);
    }

    public saveRequests(invocations: readonly Invocation[]): void {
        invocations.forEach(validateCollectionInvocation);
        if (new Set(invocations.map(invocation => invocation.id)).size !== invocations.length) {
            throw new Error(localize('azureInvoke.duplicateInvocation', 'The collection contains duplicate invocation IDs.'));
        }
        const snapshots = invocations.map(copyCollectionInvocation);
        const combined = new Map(this.requests);
        snapshots.forEach(invocation => combined.set(invocation.id, invocation));
        combined.forEach(invocation => {
            if (isHttpInvocation(invocation)) {
                planInvocationChain(invocation, id => {
                    const source = combined.get(id);
                    return isHttpInvocation(source) ? source : undefined;
                });
            }
        });
        for (const invocation of snapshots) {
            this.requests.set(invocation.id, invocation);
        }
        this.changeEmitter.fire();
    }

    public updateRequestStatus(id: string, message: HttpRequestStateMessage): void {
        const invocation = this.requests.get(id);
        if (!isHttpInvocation(invocation)) {
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
        return isHttpInvocation(invocation) ? copyInvocation(invocation) : undefined;
    }

    public getBlobInvocation(id: string): BlobInvocation | undefined {
        const invocation = this.requests.get(id);
        return isBlobInvocation(invocation) ? copyBlobInvocation(invocation) : undefined;
    }

    public getTimerInvocation(id: string): TimerInvocation | undefined {
        const invocation = this.requests.get(id);
        return isTimerInvocation(invocation) ? copyTimerInvocation(invocation) : undefined;
    }

    public updateTimerStatus(id: string, message: TimerInvocationState): void {
        if (!this.getTimerInvocation(id)) {
            return;
        }
        const running = message.command === 'invocationStarted';
        const accepted = message.command === 'invocationResult';
        const cancelled = message.command === 'invocationError' && message.cancelled;
        this.statuses.set(id, {
            text: running ? localize('azureInvoke.timerInvoking', 'Invoking...') :
                accepted ? localize('azureInvoke.timerAccepted', 'Invocation accepted; function execution not observed') :
                    cancelled ? localize('azureInvoke.timerCancelled', 'Cancelled; the function may still run') :
                        localize('azureInvoke.timerNotConfirmed', 'Invocation not confirmed'),
            icon: running ? 'loading~spin' : accepted ? 'clock' : cancelled ? 'circle-slash' : 'error',
            lastRun: running ? new Date() : this.statuses.get(id)?.lastRun ?? new Date(),
            status: running ? 'running' : accepted ? 'succeeded' : cancelled ? 'cancelled' : 'failed',
            ...(message.command === 'invocationResult' ? { statusCode: message.result.status, duration: message.result.duration } : {}),
        });
        this.changeEmitter.fire();
    }

    public getInvocations(): Invocation[] {
        return [...this.requests.values()].map(copyCollectionInvocation);
    }

    public updateBlobStatus(id: string, message: BlobUploadState): void {
        if (!this.getBlobInvocation(id)) {
            return;
        }
        const running = message.command === 'uploadStarted';
        const uploaded = message.command === 'uploadResult';
        const cancelled = message.command === 'uploadError' && message.cancelled;
        this.statuses.set(id, {
            text: running ? localize('azureInvoke.uploading', 'Uploading...') :
                uploaded ? localize('azureInvoke.blobUploadedUnverified', 'Uploaded; function execution not observed') :
                    cancelled ? localize('azureInvoke.uploadCancelled', 'Upload cancelled; storage may have changed') :
                        localize('azureInvoke.uploadFailed', 'Upload not confirmed; storage may have changed'),
            icon: running ? 'loading~spin' : uploaded ? 'cloud-upload' : cancelled ? 'circle-slash' : 'error',
            lastRun: running ? new Date() : this.statuses.get(id)?.lastRun ?? new Date(),
            status: running ? 'running' : uploaded ? 'succeeded' : cancelled ? 'cancelled' : 'failed',
        });
        this.changeEmitter.fire();
    }

    public replaceRequests(invocations: readonly Invocation[]): void {
        invocations.forEach(validateCollectionInvocation);
        for (const invocation of invocations) {
            if (isHttpInvocation(invocation)) {
                planInvocationChain(invocation, id => invocations.find((source): source is HttpInvocation => isHttpInvocation(source) && source.id === id));
            }
        }
        if (new Set(invocations.map(invocation => invocation.id)).size !== invocations.length) {
            throw new Error(localize('azureInvoke.duplicateInvocation', 'The collection contains duplicate invocation IDs.'));
        }
        this.requests.clear();
        this.statuses.clear();
        for (const invocation of invocations) {
            this.requests.set(invocation.id, copyCollectionInvocation(invocation));
        }
        this.changeEmitter.fire();
    }

    public getRequests(): HttpInvocation[] {
        return [...this.requests.values()].filter(isHttpInvocation).map(copyInvocation);
    }

    public getChildren(element?: AzureInvokeTreeElement): AzureInvokeTreeElement[] {
        if (element) {
            return 'request' in element ? [] : this.getInvocations().filter(request => request.group === element.group);
        }
        const groups = new Set<string>();
        return this.getInvocations().flatMap((request): AzureInvokeTreeElement[] => {
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
        const blob = isBlobInvocation(request);
        const timer = isTimerInvocation(request);
        item.contextValue = blob ? 'azureInvoke.blob' : timer ? 'azureInvoke.timer' : 'azureInvoke.http';
        item.iconPath = blob ? new vscode.ThemeIcon('cloud-upload') : timer ? new vscode.ThemeIcon('clock') :
            status ? new vscode.ThemeIcon(status.icon, status.color ? new vscode.ThemeColor(status.color) : undefined) : new vscode.ThemeIcon('circle-outline');
        const trigger = blob ? localize('azureInvoke.blobTriggerDescription', 'Blob Trigger') :
            timer ? localize('azureInvoke.timerTriggerDescription', 'Timer Trigger') : localize('azureInvoke.httpTriggerDescription', 'HTTP Trigger');
        item.description = !blob && !timer && status ? localize('azureInvoke.triggerLastRun', '{0} ({1})', trigger, status.lastRun.toLocaleTimeString()) : trigger;
        item.tooltip = status ?
            `${blob ? localize('azureInvoke.lastUpload', 'Last upload attempt: {0}', status.lastRun.toLocaleString()) :
                localize('azureInvoke.lastRun', 'Last run: {0}', status.lastRun.toLocaleString())}\n${status.text}` :
            timer ? localize('azureInvoke.timerNotInvoked', 'Not invoked yet. Manual invocation only; the Functions host owns the schedule.') :
                blob ? localize('azureInvoke.blobNotUploaded', 'Not uploaded yet. Manual invocation only; function execution is not observed.') :
                localize('azureInvoke.notRun', 'Not run yet');
        item.command = {
            command: 'azureFunctions.azureInvoke.open',
            title: localize('azureInvoke.openInvocation', 'Open Invocation'),
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
