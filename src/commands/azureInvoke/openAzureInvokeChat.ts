/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';

export async function openAzureInvokeChat(reviewId: string, revision?: number, diagnosisId?: string): Promise<void> {
    await openChat(diagnosisId ?
                `Diagnose failed previews in Azure Invoke collection review ${reviewId}, diagnosis ${diagnosisId}. ` +
                'Call get_invocation_diagnostics with these IDs to read only the failed results I chose to share. ' +
                'Compare the generated request definitions and returned evidence with the relevant application source. ' +
                'For each request, distinguish a request-configuration problem, a likely application bug, an environment or authentication blocker, or an uncertain cause. ' +
                'Explain the evidence and suggest the smallest next step. A non-success response alone does not establish the cause. ' +
                'Do not edit application code, update the collection, save requests, or send HTTP. ' +
                'If a request draft needs correction, explain what to change and ask me to submit it through Request changes in the review. ' +
                'Application investigation is a separate user decision. Do not try to make every response green.' :
                revision !== undefined ?
                `Revise Azure Invoke collection review ${reviewId}, revision ${revision}. ` +
                'Call get_invocation_collection_review to read the submitted feedback, selected flags, and private-edit field names. ' +
                'Apply the feedback and call propose_invocation_collection with the same reviewId, the returned revision, and the complete revised candidate list. ' +
                'Keep stable IDs for existing cases and preserve unchecked selections. Do not draft, save, or run requests. Stop after refreshing the review so I can confirm or request more changes.' :
                `Help me author Azure Invoke collection review ${reviewId}. Scan all projects in this workspace for triggers and HTTP endpoints. ` +
                'Use propose_invocation_collection with that review ID to fill the loading page with grouped, runnable HTTP requests. ' +
                'For GET requests, inspect handlers, query models, and parsing helpers for filters, pagination, sorting, and route IDs. Include all discovered query names and link instance IDs when possible. ' +
                'Populate body fields with valid synthetic values, use {{guid}} where uniqueness is required, and author dependencies and request/response bindings so later requests reuse the correct IDs and credentials. ' +
                'Ask about required inputs that cannot be inferred safely. Confirm will save my selection directly in the tree. ' +
                'Do not save invocations or run requests yourself. I may manually try previews and ask you to run the saved collection later.');
}

export async function openInvocationDebugChat(invocationId: string, debugId: string): Promise<void> {
    await openChat(
        `Debug Azure Invoke request ${invocationId}, debug authorization ${debugId}. ` +
        'Call get_http_invocation_debug_context with these IDs to inspect the explicitly shared last-run evidence. ' +
        'My local application is already running in the VS Code debugger. Do not start, attach, stop, or restart a debug session. ' +
        'Inspect the relevant application source and use Microsoft DebugMCP add_breakpoint to set a small number of useful unconditional source breakpoints. ' +
        'Explain why these locations help. Use full workspace source paths so DebugMCP targets the correct VS Code window. ' +
        'Use get_debug_status to check that the existing debugger is running before replaying. Do not resume an already paused debugger yourself. ' +
        'Then call debug_http_invocation with the same IDs to replay only the captured request, without running prerequisites. Obtain tool approval before replaying. ' +
        'The HTTP tool waits while I inspect the breakpoint and resume execution in VS Code. It has no HTTP timeout for this explicit debug replay; I can cancel it. ' +
        'Do not edit application code or request definitions, read variable values, evaluate expressions, step, or continue execution. ' +
        'Leave execution paused for me to inspect. If DebugMCP is unavailable or the evidence points to a bad request configuration, explain the blocker or suggested correction instead of changing anything.',
    );
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
