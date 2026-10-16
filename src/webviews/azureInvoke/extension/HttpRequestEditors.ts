/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { openInvocationDebugChat } from '../../../commands/azureInvoke/openAzureInvokeChat';
import { resolveInvocationDebugSession, type InvocationDebugSession } from '../../../commands/azureInvoke/resolveInvocationDebugSession';
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
    private readonly debugSessionSubscription: vscode.Disposable;
    private readonly inspections = new Map<string, { id: string; invocation: HttpInvocation }>();
    private debugTarget: {
        id: string;
        invocation: HttpInvocation;
        snapshot: NonNullable<ReturnType<HttpInvocationRunner['getLastRun']>>;
        session: InvocationDebugSession;
    } | undefined;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly provider: AzureInvokeTreeDataProvider,
        private readonly debugging = { resolveSession: resolveInvocationDebugSession, openChat: openInvocationDebugChat },
    ) {
        this.execution = new HttpInvocationRunner(id => provider.getRequest(id), (id, message) => provider.updateRequestStatus(id, message));
        this.subscription = provider.onDidChangeTreeData(() => {
            this.inspections.clear();
            if (this.debugTarget) {
                const saved = provider.getRequest(this.debugTarget.invocation.id);
                if (!saved || getDebugDefinition(saved) !== getDebugDefinition(this.debugTarget.invocation)) {
                    this.debugTarget = undefined;
                }
            }
            for (const [id, controller] of this.controllers) {
                controller.updateSources(this.getSources(id));
            }
        });
        this.debugSessionSubscription = vscode.debug.onDidChangeActiveDebugSession(session => {
            if (this.debugTarget && session?.id !== this.debugTarget.session.id) {
                this.debugTarget = undefined;
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
            debug: context => this.debugInvocation(context, invocation.id),
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

    private async debugInvocation(context: IActionContext, id: string): Promise<void> {
        const session = await this.debugging.resolveSession(context);
        const invocation = this.provider.getRequest(id);
        const snapshot = this.execution.getLastRun(id);
        if (!invocation || !snapshot || getDebugDefinition(invocation) !== getDebugDefinition(snapshot.run.invocation)) {
            throw new Error(localize('azureInvoke.debugRunRequired', 'Save and send this request before debugging its response. The saved request must match the last run; unsaved editor changes are not replayed.'));
        }
        if (!snapshot.run.canShareResponse) {
            throw new Error(localize('azureInvoke.debugLocalOnly', 'This prototype debugs only localhost requests whose prerequisites are also local.'));
        }
        const target = { id: randomUUID(), invocation: copyInvocation(invocation), snapshot, session };
        this.debugTarget = target;
        try {
            await this.debugging.openChat(id, target.id);
        } catch (error) {
            if (this.debugTarget === target) {
                this.debugTarget = undefined;
            }
            throw error;
        }
    }

    private async getDebugTarget(context: IActionContext, id: string, debugId: string) {
        const target = this.debugTarget;
        if (!target || target.id !== debugId || target.invocation.id !== id) {
            throw new Error(localize('azureInvoke.debugExpired', 'This debug request is no longer active. Select Debug with Copilot again.'));
        }
        const session = await this.debugging.resolveSession(context);
        const invocation = this.provider.getRequest(id);
        const latest = this.execution.getLastRun(id);
        if (this.debugTarget !== target || session.id !== target.session.id || !invocation ||
            latest?.run !== target.snapshot.run || latest.message !== target.snapshot.message ||
            getDebugDefinition(invocation) !== getDebugDefinition(target.invocation)) {
            this.debugTarget = undefined;
            throw new Error(localize('azureInvoke.debugChanged', 'The request, its result, or the active debugger changed. Select Debug with Copilot again.'));
        }
        return target;
    }

    public async getDebugContext(context: IActionContext, id: string, debugId: string) {
        const target = await this.getDebugTarget(context, id, debugId);
        const { request } = target.snapshot.run;
        const { message } = target.snapshot;
        return {
            id, debugId, method: request.method, path: new URL(request.url).pathname,
            workspaceFolder: target.session.workspaceFolder,
            diagnostic: message.command === 'response' ?
                { outcome: 'response' as const, ...getShareableHttpResponse(message.response, true) } :
                { outcome: 'requestError' as const, message: message.message },
        };
    }

    public async debugRequest(context: IActionContext, id: string, debugId: string, signal?: AbortSignal) {
        const target = await this.getDebugTarget(context, id, debugId);
        this.debugTarget = undefined;
        const abort = new AbortController();
        const subscription = vscode.debug.onDidTerminateDebugSession(session => {
            if (session.id === target.session.id) {
                abort.abort();
            }
        });
        try {
            return await this.execution.send(context, target.invocation, {
                saved: true, runDependencies: false, timeout: null,
                replayRequest: target.snapshot.run.request,
                signal: signal ? AbortSignal.any([signal, abort.signal]) : abort.signal,
            });
        } finally {
            subscription.dispose();
        }
    }

    private getSources(id: string) {
        return this.provider.getRequests().filter(source => source.id !== id).map(({ id, name }) => ({ id, name }));
    }

    public closeAll(): void {
        this.debugTarget = undefined;
        this.inspections.clear();
        for (const controller of this.controllers.values()) {
            controller.panel.dispose();
        }
        this.execution.clear();
    }

    public dispose(): void {
        this.closeAll();
        this.subscription.dispose();
        this.debugSessionSubscription.dispose();
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
