/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { openBlobInvocationDebugChat } from '../../../commands/azureInvoke/openAzureInvokeChat';
import { resolveInvocationDebugSession, type InvocationDebugSession } from '../../../commands/azureInvoke/resolveInvocationDebugSession';
import { localize } from '../../../localize';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { copyBlobInvocation, type BlobInvocation, type BlobUploadState } from '../shared/blobInvocation';
import { BlobInvocationController } from './BlobInvocationController';
import { BlobUploadAuthorizationError, uploadBlob } from './uploadBlob';

interface BlobDebugTarget {
    id: string;
    invocation: BlobInvocation;
    session: InvocationDebugSession;
    consumed: boolean;
    breakpointGuidance?: string;
}

export class BlobInvocationEditors implements vscode.Disposable {
    private readonly controllers = new Map<string, BlobInvocationController>();
    private readonly uploads = new Map<string, AbortController>();
    private readonly messages = new Map<string, BlobUploadState>();
    private readonly changeEmitter = new vscode.EventEmitter<{ id: string; message: BlobUploadState }>();
    private readonly debugSubscription: vscode.Disposable;
    private readonly collectionSubscription: vscode.Disposable;
    private debugTarget: BlobDebugTarget | undefined;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly provider: AzureInvokeTreeDataProvider,
        private readonly debugging = { resolveSession: resolveInvocationDebugSession, openChat: openBlobInvocationDebugChat },
    ) {
        this.collectionSubscription = provider.onDidChangeTreeData(() => {
            const target = this.debugTarget;
            if (target && JSON.stringify(provider.getBlobInvocation(target.invocation.id)?.request) !== JSON.stringify(target.invocation.request)) {
                this.cancel(target.invocation.id);
                this.debugTarget = undefined;
            }
        });
        this.debugSubscription = vscode.debug.onDidChangeActiveDebugSession(session => {
            if (this.debugTarget && this.debugTarget.session.id !== session?.id) {
                this.cancel(this.debugTarget.invocation.id);
                this.debugTarget = undefined;
            }
        });
    }

    public get size(): number {
        return this.controllers.size;
    }

    public open(invocation: BlobInvocation, saved: boolean): BlobInvocationController {
        const existing = this.controllers.get(invocation.id);
        if (existing) {
            existing.revealToForeground(vscode.ViewColumn.Active);
            return existing;
        }
        const controller = new BlobInvocationController(this.context, invocation, saved, {
            save: snapshot => this.provider.saveRequest(snapshot),
            upload: (context, snapshot) => this.upload(context, snapshot),
            cancel: () => this.cancel(invocation.id),
            debug: context => this.debugInvocation(context, invocation.id),
            state: () => this.messages.get(invocation.id),
            onDidChange: this.changeEmitter.event,
        });
        this.controllers.set(invocation.id, controller);
        controller.onDisposed(() => {
            this.controllers.delete(invocation.id);
            this.cancel(invocation.id);
        });
        return controller;
    }

    public async debugInvocation(context: IActionContext, id: string): Promise<void> {
        const invocation = this.requireInvocation(id);
        if (this.uploads.has(id)) {
            throw new Error(localize('azureInvoke.blobBusy', 'An upload is already in progress. Wait or cancel it first.'));
        }
        const session = await this.debugging.resolveSession(context);
        const target: BlobDebugTarget = { id: randomUUID(), invocation, session, consumed: false };
        this.debugTarget = target;
        try {
            const guidance = await context.ui.showInputBox({
                title: localize('azureInvoke.breakpointGuidanceTitle', 'Breakpoint guidance (optional)'),
                prompt: localize('azureInvoke.breakpointGuidancePrompt', 'Tell Copilot where to set breakpoints, or leave blank to let it choose. Shared with Copilot for this upload; do not include secrets.'),
                placeHolder: localize('azureInvoke.breakpointGuidancePlaceholder', 'For example, pause where inventory rows are validated.'),
                validateInput: value => value.length > 500 ?
                    localize('azureInvoke.breakpointGuidanceTooLong', 'Keep breakpoint guidance within 500 characters.') : undefined,
            });
            context.valuesToMask.push(guidance);
            target.breakpointGuidance = guidance.trim() || undefined;
            await this.requireDebugTarget(context, id, target.id);
            await this.debugging.openChat(id, target.id);
        } catch (error) {
            if (this.debugTarget === target) {
                this.debugTarget = undefined;
            }
            throw error;
        }
    }

    public async getDebugContext(context: IActionContext, id: string, debugId: string) {
        const target = await this.requireDebugTarget(context, id, debugId);
        return {
            id, debugId, workspaceFolder: target.session.workspaceFolder,
            trigger: 'blob' as const, targetKind: 'azurite' as const, manualOnly: true as const,
            container: target.invocation.request.container, blobName: target.invocation.request.blobName,
            contentType: target.invocation.request.contentType,
            ...(target.breakpointGuidance ? { breakpointGuidance: target.breakpointGuidance } : {}),
        };
    }

    public async uploadSaved(context: IActionContext, id: string, signal?: AbortSignal, debugId?: string) {
        const target = debugId === undefined ? undefined : await this.requireDebugTarget(context, id, debugId);
        if (target) {
            target.consumed = true;
        }
        return await this.upload(context, target?.invocation ?? this.requireInvocation(id), signal, target);
    }

    private async upload(context: IActionContext, invocation: BlobInvocation, signal?: AbortSignal, target?: BlobDebugTarget) {
        if (this.uploads.has(invocation.id)) {
            throw new Error(localize('azureInvoke.blobBusy', 'An upload is already in progress. Wait or cancel it first.'));
        }
        const snapshot = copyBlobInvocation(invocation);
        const abort = new AbortController();
        this.uploads.set(snapshot.id, abort);
        const cancel = (): void => abort.abort();
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) {
            abort.abort();
        }
        const debugTermination = target && vscode.debug.onDidTerminateDebugSession(session => {
            if (session.id === target.session.id) {
                abort.abort();
            }
        });
        const publish = (message: BlobUploadState): void => {
            if (this.uploads.get(snapshot.id) === abort) {
                this.messages.set(snapshot.id, message);
                this.provider.updateBlobStatus(snapshot.id, message);
                this.changeEmitter.fire({ id: snapshot.id, message });
            }
        };
        publish({ command: 'uploadStarted' });
        try {
            const result = await uploadBlob(context, snapshot, abort.signal, async () => {
                if (target) {
                    await this.requireDebugTarget(context, snapshot.id, target.id, target);
                }
            });
            publish({ command: 'uploadResult', result });
            return result;
        } catch (error) {
            const cancelled = abort.signal.aborted || isUserCancelledError(error);
            publish({
                command: 'uploadError', cancelled,
                message: cancelled ? localize('azureInvoke.uploadCancelledHint', 'Upload cancelled. Storage may already have changed; cancellation does not undo an upload.') :
                    error instanceof Error ? error.message : localize('azureInvoke.uploadFailed', 'Upload not confirmed; storage may have changed'),
            });
            if (cancelled) {
                throw new UserCancelledError('azureInvoke.uploadBlob');
            }
            throw error;
        } finally {
            signal?.removeEventListener('abort', cancel);
            debugTermination?.dispose();
            if (this.uploads.get(snapshot.id) === abort) {
                this.uploads.delete(snapshot.id);
            }
        }
    }

    private requireInvocation(id: string): BlobInvocation {
        const invocation = this.provider.getBlobInvocation(id);
        if (!invocation) {
            throw new Error(localize('azureInvoke.blobNotSaved', 'Save this Blob invocation first, then try again.'));
        }
        return invocation;
    }

    private async requireDebugTarget(context: IActionContext, id: string, debugId: string, executing?: BlobDebugTarget): Promise<BlobDebugTarget> {
        const target = this.debugTarget;
        const current = this.provider.getBlobInvocation(id);
        if (!target || target.id !== debugId || target.invocation.id !== id ||
            (target.consumed && target !== executing) || !current ||
            JSON.stringify(current.request) !== JSON.stringify(target.invocation.request)) {
            throw new BlobUploadAuthorizationError(localize('azureInvoke.blobDebugExpired', 'Blob upload authorization expired or the fixture changed. Select Upload with Copilot breakpoints again. No upload was sent.'));
        }
        let session: InvocationDebugSession;
        try {
            session = await this.debugging.resolveSession(context);
        } catch {
            throw new BlobUploadAuthorizationError(localize('azureInvoke.blobDebuggerMissing', 'The authorized debugger is no longer available. Start your application and select Upload with Copilot breakpoints again. No upload was sent.'));
        }
        if (session.id !== target.session.id || this.debugTarget !== target || (target.consumed && target !== executing)) {
            throw new BlobUploadAuthorizationError(localize('azureInvoke.blobDebuggerChanged', 'The debugger changed. Select Upload with Copilot breakpoints again to authorize this session. No upload was sent.'));
        }
        return target;
    }

    public cancel(id: string): void {
        this.uploads.get(id)?.abort();
    }

    public closeAll(): void {
        this.debugTarget = undefined;
        this.uploads.forEach(upload => upload.abort());
        this.uploads.clear();
        this.messages.clear();
        this.controllers.forEach(controller => controller.dispose());
        this.controllers.clear();
    }

    public dispose(): void {
        this.closeAll();
        this.debugSubscription.dispose();
        this.collectionSubscription.dispose();
        this.changeEmitter.dispose();
    }
}
