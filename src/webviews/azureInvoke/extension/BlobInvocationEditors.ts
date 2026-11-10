/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../../localize';
import { type AzureInvokeTreeDataProvider } from '../../../tree/azureInvoke/AzureInvokeTreeDataProvider';
import { copyBlobInvocation, type BlobInvocation, type BlobUploadState } from '../shared/blobInvocation';
import { BlobInvocationController } from './BlobInvocationController';
import { uploadBlob } from './uploadBlob';

export class BlobInvocationEditors implements vscode.Disposable {
    private readonly controllers = new Map<string, BlobInvocationController>();
    private readonly uploads = new Map<string, AbortController>();
    private readonly messages = new Map<string, BlobUploadState>();
    private readonly changeEmitter = new vscode.EventEmitter<{ id: string; message: BlobUploadState }>();

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly provider: AzureInvokeTreeDataProvider,
    ) { }

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

    public async uploadSaved(context: IActionContext, id: string, signal?: AbortSignal) {
        return await this.upload(context, this.requireInvocation(id), signal);
    }

    private async upload(context: IActionContext, invocation: BlobInvocation, signal?: AbortSignal) {
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
        const publish = (message: BlobUploadState): void => {
            if (this.uploads.get(snapshot.id) === abort) {
                this.messages.set(snapshot.id, message);
                this.provider.updateBlobStatus(snapshot.id, message);
                this.changeEmitter.fire({ id: snapshot.id, message });
            }
        };
        publish({ command: 'uploadStarted' });
        try {
            const result = await uploadBlob(context, snapshot, abort.signal);
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

    public cancel(id: string): void {
        this.uploads.get(id)?.abort();
    }

    public closeAll(): void {
        this.uploads.forEach(upload => upload.abort());
        this.uploads.clear();
        this.messages.clear();
        this.controllers.forEach(controller => controller.dispose());
        this.controllers.clear();
    }

    public dispose(): void {
        this.closeAll();
        this.changeEmitter.dispose();
    }
}
