/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../localize';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { copyInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { getRequestDependencies, type HttpInvocation } from '../shared/httpRequest';
import { HttpRequestController } from './HttpRequestController';
import { HttpInvocationRunner } from './HttpInvocationRunner';
import { getShareableHttpResponse } from './sendHttpRequest';

export class HttpRequestEditors implements vscode.Disposable {
    private readonly controllers = new Map<string, HttpRequestController>();
    private readonly execution: HttpInvocationRunner;
    private readonly subscription: vscode.Disposable;
    private readonly inspections = new Map<string, { id: string; invocation: HttpInvocation }>();

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly provider: AzureInvokeTreeDataProvider,
    ) {
        this.execution = new HttpInvocationRunner(id => provider.getRequest(id), (id, message) => provider.updateRequestStatus(id, message));
        this.subscription = provider.onDidChangeTreeData(() => {
            this.inspections.clear();
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

    public getInspection(id: string) {
        const invocation = this.provider.getRequest(id);
        if (!invocation) {
            throw new Error(localize('azureInvoke.requestNotFound', 'This invocation is no longer in the collection.'));
        }
        const inspectionId = randomUUID();
        this.inspections.set(id, { id: inspectionId, invocation });
        const snapshot = this.execution.getLastRun(id);
        const result = this.execution.messages.filter(message => message.id === id).at(-1)?.message;
        const url = URL.canParse(invocation.request.url) ? new URL(invocation.request.url) : undefined;
        const urlQuery = [...(url?.searchParams ?? [])].map(([name, value]) => ({ name, enabled: true, hasValue: !!value, inUrl: true }));
        if (url) {
            url.search = '';
            url.hash = '';
            url.username = '';
            url.password = '';
        }
        return {
            id, inspectionId, name: invocation.name, group: invocation.group,
            ...this.provider.getRequestRunStatus(id),
            request: {
                method: invocation.request.method, url: url?.toString(),
                headers: invocation.request.headers.filter(entry => entry.name).map(entry => ({ name: entry.name, enabled: entry.enabled !== false, hasValue: !!entry.value })),
                query: [...urlQuery, ...invocation.request.query.filter(entry => entry.name).map(entry => ({ name: entry.name, enabled: entry.enabled !== false, hasValue: !!entry.value, inUrl: false }))],
                hasBody: !!invocation.request.body,
                bindings: invocation.request.bindings ?? [],
                dependencyIds: getRequestDependencies(invocation.request),
            },
            resultMatchesSavedRequest: !!snapshot && getDebugDefinition(invocation) === getDebugDefinition(snapshot.run.invocation),
            diagnostic: !this.execution.isRunning(id) && result && result.command !== 'requestStarted' ?
                result.command === 'response' ?
                    { outcome: 'response' as const, ...getShareableHttpResponse(result.response, !!snapshot?.run.canShareResponse, 64 * 1024) } :
                    { outcome: 'requestError' as const, message: result.message } : undefined,
        };
    }

    public getInspectedInvocation(id: string, inspectionId: string): HttpInvocation {
        const inspection = this.inspections.get(id);
        const current = this.provider.getRequest(id);
        if (!inspection || inspection.id !== inspectionId || !current ||
            JSON.stringify(current) !== JSON.stringify(inspection.invocation) || this.execution.isRunning(id)) {
            throw new Error(localize('azureInvoke.inspectionExpired', 'The collection or its results changed. Inspect the saved request again before proposing changes.'));
        }
        return copyInvocation(inspection.invocation);
    }

    private getSources(id: string) {
        return this.provider.getRequests().filter(source => source.id !== id).map(({ id, name }) => ({ id, name }));
    }

    public closeAll(): void {
        this.inspections.clear();
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

function getDebugDefinition(invocation: HttpInvocation): string {
    const { request } = copyInvocation(invocation);
    // Empty editor rows and disabled GET/HEAD bodies do not change what was sent.
    return JSON.stringify({
        ...request,
        body: request.method === 'GET' || request.method === 'HEAD' ? '' : request.body,
        headers: request.headers.filter(entry => entry.name || entry.value),
        query: request.query.filter(entry => entry.name || entry.value),
    });
}
