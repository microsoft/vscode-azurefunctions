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
import { isTimerInvocation, type TimerInvocation, type TimerInvocationResult, type TimerInvocationState, type TimerViewConfiguration, type TimerViewMessage } from '../shared/timerInvocation';

export class TimerInvocationController extends WebviewController<TimerViewConfiguration> {
    private ready = false;
    private focusGuidance = false;

    public constructor(
        context: vscode.ExtensionContext,
        private readonly invocation: TimerInvocation,
        saved: boolean,
        private readonly operations: {
            save(invocation: TimerInvocation): void;
            run(context: IActionContext, invocation: TimerInvocation): Promise<TimerInvocationResult>;
            cancel(): void;
            debug(context: IActionContext, guidance: string): Promise<void>;
            state(): TimerInvocationState | undefined;
            onDidChange: vscode.Event<{ id: string; message: TimerInvocationState }>;
        },
    ) {
        super(context, invocation.name, 'azureInvokeTimer', {
            invocation, saved,
            labels: {
                subtitle: localize('azureInvoke.timerTriggerDescription', 'Timer Trigger'),
                name: localize('azureInvoke.invocationName', 'Invocation name'),
                hostUrl: localize('azureInvoke.timerHostUrl', 'Functions host URL'),
                functionName: localize('azureInvoke.timerFunctionName', 'Function name'),
                schedule: localize('azureInvoke.timerSchedule', 'Configured schedule'),
                unknownSchedule: localize('azureInvoke.timerScheduleUnknown', 'Not discovered'),
                scheduleHint: localize('azureInvoke.timerScheduleHint', 'The Functions host owns this schedule. Run once does not change it.'),
                guidance: localize('azureInvoke.breakpointGuidanceLabel', 'Breakpoint guidance (optional)'),
                guidancePlaceholder: localize('azureInvoke.timerGuidancePlaceholder', 'For example, pause before expired records are deleted.'),
                guidancePrivacy: localize('azureInvoke.timerGuidancePrivacy', 'Shared with Copilot for this invocation only. Leave blank to let Copilot choose. Do not include secrets.'),
                save: localize('azureInvoke.save', 'Save'),
                saving: localize('azureInvoke.saving', 'Saving...'),
                saved: localize('azureInvoke.saved', 'Saved for this session'),
                unsaved: localize('azureInvoke.unsaved', 'Unsaved changes'),
                run: localize('azureInvoke.timerRunOnce', 'Run once'),
                running: localize('azureInvoke.timerInvoking', 'Invoking...'),
                cancel: localize('azureInvoke.cancel', 'Cancel'),
                debug: localize('azureInvoke.timerRunWithBreakpoints', 'Run with Copilot breakpoints'),
                accepted: localize('azureInvoke.timerAccepted', 'Invocation accepted; function execution not observed'),
                result: localize('azureInvoke.timerResult', 'Invocation result'),
                notConfirmed: localize('azureInvoke.timerNotConfirmed', 'Invocation not confirmed'),
                status: localize('azureInvoke.timerHttpStatus', 'Host status'),
                duration: localize('azureInvoke.blobDuration', 'Duration (ms)'),
            },
        }, vscode.ViewColumn.Active, vscode.Uri.joinPath(context.extensionUri, 'resources', 'azure-functions.svg'), {
            distDir: path.join(context.extensionPath, 'dist', 'azureInvoke'),
            scriptFileName: 'timerInvocation.js', styleFileName: 'timerInvocation.css',
        });
        this.registerDisposable(operations.onDidChange(({ id, message }) => {
            if (id === invocation.id && this.ready) {
                void callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.timerProgress', async context => {
                    context.telemetry.suppressAll = true;
                    context.errorHandling.suppressDisplay = true;
                    await this.postMessage(message);
                });
            }
        }));
        this.registerDisposable(this.panel.webview.onDidReceiveMessage((message: unknown) => {
            void callWithTelemetryAndErrorHandling('azureFunctions.azureInvoke.timerEditor', async context => {
                context.telemetry.maskEntireErrorMessage = true;
                context.errorHandling.suppressDisplay = true;
                try {
                    await this.handleMessage(context, message);
                } catch (error) {
                    await this.postMessage({
                        command: 'error', message: isUserCancelledError(error) ?
                            localize('azureInvoke.timerCancelled', 'Cancelled; the function may still run') :
                            error instanceof Error ? error.message : localize('azureInvoke.timerNotConfirmed', 'Invocation not confirmed'),
                    });
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
        } else if (message.command === 'cancelInvocation') {
            this.operations.cancel();
        } else if (message.command === 'debugTimer' && 'breakpointGuidance' in message && typeof message.breakpointGuidance === 'string') {
            await this.operations.debug(context, message.breakpointGuidance);
            await this.postMessage({ command: 'notice', message: localize('azureInvoke.timerDebugOpened', 'Opened Copilot to set breakpoints and invoke the saved timer once.') });
        } else if ((message.command === 'saveTimer' || message.command === 'runTimer') && 'invocation' in message &&
            isTimerInvocation(message.invocation) && message.invocation.id === this.invocation.id) {
            validateCollectionInvocation(message.invocation);
            if (message.command === 'saveTimer') {
                this.operations.save(message.invocation);
                this.panel.title = message.invocation.name;
                await this.postMessage({ command: 'saved' });
            } else {
                await this.operations.run(context, message.invocation);
            }
        } else {
            throw new Error(localize('azureInvoke.invalidMessage', 'Invalid Azure Invoke request.'));
        }
    }

    protected override getDocumentTemplate(webview?: vscode.Webview): string {
        const encoded = encodeURIComponent(JSON.stringify(this.configuration));
        return super.getDocumentTemplate(webview).replace(encoded, encoded.replace(/'/g, '%27'));
    }

    private async postMessage(message: TimerViewMessage): Promise<void> {
        if (!this.isDisposed) {
            await this.panel.webview.postMessage(message);
        }
    }
}
