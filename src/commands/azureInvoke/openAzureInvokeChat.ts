/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';

export async function openAzureInvokeChat(reviewId: string, revision?: number, diagnosisId?: string): Promise<void> {
    await openChat(diagnosisId ?
                [
                    '**Diagnose failed previews**',
                    '',
                    `Review: \`${reviewId}\``,
                    `Diagnosis: \`${diagnosisId}\``,
                    '',
                    'Follow your "Diagnose failed previews" workflow, starting with get_invocation_diagnostics.',
                    'Compare the shared failures with source and explain the cause and smallest next step. Keep this diagnosis read-only.',
                ].join('\n') :
                revision !== undefined ?
                [
                    '**Revise the collection**',
                    '',
                    `Review: \`${reviewId}\``,
                    `Revision: ${revision}`,
                    '',
                    'Follow your "Apply review feedback" workflow, starting with get_invocation_collection_review.',
                    'Propose the complete revision, preserving existing IDs, selections, private edits, and Blob files. Choose files for new Blob fixtures, then stop for my review. Do not save or execute.',
                ].join('\n') :
                [
                    '**Author a collection**',
                    '',
                    `Review: \`${reviewId}\``,
                    '',
                    'Follow your "Discover and propose" workflow across all workspace projects.',
                    'Propose grouped HTTP requests and manual Blob and Timer invocations with propose_invocation_collection. Follow "Choose Blob files" before any file picker.',
                    'Stop for my review. Do not save or execute.',
                ].join('\n'));
}

export async function openInvocationDebugChat(invocationId: string, debugId: string): Promise<void> {
    await openChat([
        '**Debug a saved request**',
        '',
        `Invocation: \`${invocationId}\``,
        `Debug authorization: \`${debugId}\``,
        '',
        'Follow your "Debug a saved request" workflow, starting with get_http_invocation_debug_context.',
        'Set source breakpoints, then use debug_http_invocation to replay only the captured request with tool approval.',
        'The debugger is already running. Leave inspection and execution control to me; do not edit code or requests.',
    ].join('\n'));
}

export async function openBlobInvocationDebugChat(invocationId: string, debugId: string): Promise<void> {
    await openChat([
        '**Upload with Copilot breakpoints**',
        '',
        `Invocation: \`${invocationId}\``,
        `Debug authorization: \`${debugId}\``,
        '',
        'Follow your "Invoke a Blob trigger manually" workflow, starting with get_blob_invocation_debug_context.',
        'Use any breakpointGuidance, set source breakpoints, then call upload_blob_invocation with both IDs for this single captured-fixture upload.',
        'Already authorized; no extra confirmation beyond tool approval. The app, Azurite, and debugger are running. Leave inspection and execution control to me.',
    ].join('\n'));
}

export async function openTimerInvocationDebugChat(invocationId: string, debugId: string): Promise<void> {
    await openChat([
        '**Run a timer with Copilot breakpoints**',
        '',
        `Invocation: \`${invocationId}\``,
        `Debug authorization: \`${debugId}\``,
        '',
        'Follow your "Invoke a Timer manually" workflow, starting with get_timer_invocation_debug_context.',
        'Use any breakpointGuidance, set source breakpoints, then call debug_timer_invocation with both IDs for this single invocation.',
        'The host and debugger are already running. Leave execution control to me. Do not alter the schedule or start a scheduler.',
    ].join('\n'));
}

async function openChat(query: string): Promise<void> {
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', { mode: 'Azure Invoke', query });
    } catch (error) {
        if (isUserCancelledError(error)) {
            throw error;
        }
        // eslint-disable-next-line preserve-caught-error -- Native chat errors may contain workspace or request details.
        throw new Error(localize('azureInvoke.chatUnavailable', 'Could not open Copilot Chat. Enable GitHub Copilot Chat and try again.'));
    }
}
