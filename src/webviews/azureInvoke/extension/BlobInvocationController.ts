/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { WebviewController } from '@microsoft/vscode-azext-webview';
import * as path from 'path';
import * as vscode from 'vscode';
import { localize } from '../../../localize';
import { validateCollectionInvocation } from '../../../tree/azureInvoke/invocationCollection';
import { isBlobInvocation, type BlobInvocation, type BlobUploadResult, type BlobUploadState, type BlobViewConfiguration, type BlobViewMessage } from '../shared/blobInvocation';
import { pickBlobFile } from './pickBlobFile';

export class BlobInvocationController extends WebviewController<BlobViewConfiguration> {
    private ready = false;
    private focusGuidance = false;

    public constructor(
        context: vscode.ExtensionContext,
        private readonly invocation: BlobInvocation,
        saved: boolean,
        private readonly operations: {
            save(invocation: BlobInvocation): void;
            upload(context: IActionContext, invocation: BlobInvocation): Promise<BlobUploadResult>;
            cancel(): void;
            debug(context: IActionContext, guidance: string): Promise<void>;
            state(): BlobUploadState | undefined;
            onDidChange: vscode.Event<{ id: string; message: BlobUploadState }>;
        },
    ) {
        super(context, invocation.name, 'azureInvokeBlob', {
            invocation, saved,
            labels: {
                subtitle: localize('azureInvoke.blobTriggerDescription', 'Blob Trigger'),
                name: localize('azureInvoke.invocationName', 'Invocation name'),
                target: localize('azureInvoke.azuriteTarget', 'Storage target: Azurite blob service URL'),
                container: localize('azureInvoke.blobContainer', 'Container'),
                blobName: localize('azureInvoke.blobName', 'Blob name'),
                contentType: localize('azureInvoke.blobContentType', 'Content type'),
                fileLabel: localize('azureInvoke.blobFileLabel', 'File'),
                file: localize('azureInvoke.chooseBlobFile', 'Choose file...'),
                noFile: localize('azureInvoke.noBlobFile', 'No file selected'),
                capturedFixture: localize('azureInvoke.capturedBlobFixture', 'Captured fixture'),
                save: localize('azureInvoke.save', 'Save'),
                saving: localize('azureInvoke.saving', 'Saving...'),
                saved: localize('azureInvoke.saved', 'Saved for this session'),
                unsaved: localize('azureInvoke.unsaved', 'Unsaved changes'),
                upload: localize('azureInvoke.uploadBlob', 'Upload blob'),
                uploading: localize('azureInvoke.uploading', 'Uploading...'),
                cancel: localize('azureInvoke.cancel', 'Cancel'),
                debug: localize('azureInvoke.uploadWithBreakpoints', 'Upload with Copilot breakpoints'),
                breakpointGuidance: localize('azureInvoke.breakpointGuidanceLabel', 'Breakpoint guidance (optional)'),
                breakpointGuidancePlaceholder: localize('azureInvoke.breakpointGuidancePlaceholder', 'For example, pause where inventory rows are validated.'),
                breakpointGuidancePrivacy: localize('azureInvoke.breakpointGuidancePrivacy', 'Shared with Copilot for this upload only. Leave blank to let Copilot choose. Do not include secrets.'),
                receipt: localize('azureInvoke.blobReceipt', 'Upload receipt'),
                receiptHint: localize('azureInvoke.blobReceiptHint', 'An upload receipt does not prove the function ran or succeeded. Use breakpoints to observe execution.'),
                uploaded: localize('azureInvoke.blobUploaded', 'Uploaded to Azurite. Function execution not observed.'),
                notConfirmed: localize('azureInvoke.blobUploadNotConfirmed', 'Upload not confirmed.'),
                cancelled: localize('azureInvoke.blobUploadCancelled', 'Upload cancelled.'),
                bytes: localize('azureInvoke.blobBytes', 'Bytes'),
                duration: localize('azureInvoke.blobDuration', 'Duration (ms)'),
                etag: localize('azureInvoke.blobEtag', 'ETag'),
                lastModified: localize('azureInvoke.blobLastModified', 'Last modified'),
            },
        }, vscode.ViewColumn.Active, vscode.Uri.joinPath(context.extensionUri, 'resources', 'azure-functions.svg'), {
            distDir: path.join(context.extensionPath, 'dist', 'azureInvoke'),
            scriptFileName: 'blobInvocation.js', styleFileName: 'blobInvocation.css',
        });
        this.registerDisposable(operations.onDidChange(({ id, message }) => {
            if (id === invocation.id && this.ready) {
                void callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.updateBlobReceipt', async context => {
                    context.telemetry.suppressAll = true;
                    context.errorHandling.suppressDisplay = true;
                    await this.postMessage(message);
                });
            }
        }));
        this.registerDisposable(this.panel.webview.onDidReceiveMessage((message: unknown) => {
            void callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.blobEditor', async context => {
                context.telemetry.maskEntireErrorMessage = true;
                context.errorHandling.suppressDisplay = true;
                try {
                    await this.handleMessage(context, message);
                } catch (error) {
                    if (isUserCancelledError(error) && message && typeof message === 'object' && 'command' in message && message.command === 'loadFile') {
                        await this.postMessage({ command: 'fileSelectionCancelled' });
                    } else {
                        await this.postMessage({ command: 'error', message: isUserCancelledError(error) ?
                            localize('azureInvoke.blobActionCancelled', 'Action cancelled. Cancellation does not undo an upload.') :
                            error instanceof Error ? error.message : localize('azureInvoke.blobActionFailed', 'The Blob action failed.') });
                    }
                    throw error;
                }
            });
        }));
    }

    public async focusBreakpointGuidance(): Promise<void> {
        this.focusGuidance = true;
        if (this.ready) {
            await this.postMessage({ command: 'focusBreakpointGuidance' });
            this.focusGuidance = false;
        }
    }

    private async handleMessage(context: IActionContext, message: unknown): Promise<void> {
        if (!message || typeof message !== 'object' || !('command' in message)) {
            throw new Error(localize('azureInvoke.invalidMessage', 'Invalid Azure Invoke request.'));
        }
        if (message.command === 'ready') {
            context.telemetry.suppressAll = true;
            this.ready = true;
            const state = this.operations.state();
            if (state) {
                await this.postMessage(state);
            }
            if (this.focusGuidance) {
                await this.focusBreakpointGuidance();
            }
        } else if (message.command === 'cancelUpload') {
            this.operations.cancel();
        } else if (message.command === 'debugBlob') {
            if (!('breakpointGuidance' in message) || typeof message.breakpointGuidance !== 'string') {
                throw new Error(localize('azureInvoke.invalidMessage', 'Invalid Azure Invoke request.'));
            }
            await this.operations.debug(context, message.breakpointGuidance);
            await this.postMessage({ command: 'notice', message: localize('azureInvoke.blobDebugOpened', 'Opened Copilot to set breakpoints and upload the authorized saved fixture.') });
        } else if (message.command === 'loadFile') {
            await this.postMessage({ command: 'fileLoaded', ...await pickBlobFile(context) });
        } else if ((message.command === 'saveBlob' || message.command === 'uploadBlob') && 'invocation' in message) {
            if (!isBlobInvocation(message.invocation) || message.invocation.id !== this.invocation.id) {
                throw new Error(localize('azureInvoke.invalidMessage', 'Invalid Azure Invoke request.'));
            }
            const snapshot = message.invocation;
            validateCollectionInvocation(snapshot);
            if (message.command === 'saveBlob') {
                this.operations.save(snapshot);
                this.panel.title = snapshot.name;
                await this.postMessage({ command: 'saved' });
            } else {
                await this.operations.upload(context, snapshot);
            }
        } else {
            throw new Error(localize('azureInvoke.invalidMessage', 'Invalid Azure Invoke request.'));
        }
    }

    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        const encoded = encodeURIComponent(JSON.stringify(this.configuration));
        return super.getDocumentTemplate(webview).replace(encoded, encoded.replace(/'/g, '%27'));
    }

    private async postMessage(message: BlobViewMessage): Promise<void> {
        if (!this.isDisposed) {
            await this.panel.webview.postMessage(message);
        }
    }
}
