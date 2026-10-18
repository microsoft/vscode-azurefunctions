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
                'Keep this diagnosis read-only: do not update the collection, save requests, send HTTP, or change application code unless I subsequently ask for a code fix in this chat. ' +
                'If a request draft needs correction, explain what to change and ask me to submit it through Request changes in the review. ' +
                'If I ask for a code fix, handle it in this same conversation. Do not try to make every response green by weakening requests.' :
                revision !== undefined ?
                `Revise Azure Invoke collection review ${reviewId}, revision ${revision}. ` +
                'Call get_invocation_collection_review to read the submitted feedback, selected flags, and private-edit field names. ' +
                'Apply the feedback and call propose_invocation_collection with the same reviewId, the returned revision, and the complete revised candidate list. ' +
                'Keep stable IDs for existing cases and preserve unchecked selections, private metadata edits, and already selected Blob files. ' +
                'For new Blob fixtures without a file, call select_blob_invocation_file after proposing. Do not reopen a cancelled picker without my request. ' +
                'Do not draft, save, run requests, or upload blobs. Then stop so I can confirm or request more changes.' :
                `Help me author Azure Invoke collection review ${reviewId}. Scan all projects in this workspace for triggers and HTTP endpoints. ` +
                'Use propose_invocation_collection with that review ID to fill the loading page with grouped HTTP requests and supported manual-only Blob fixtures. ' +
                'For GET requests, inspect handlers, query models, and parsing helpers for filters, pagination, sorting, and route IDs. Include all discovered query names and link instance IDs when possible. ' +
                'Populate body fields with valid synthetic values, use {{guid}} where uniqueness is required, and author dependencies and request/response bindings so later requests reuse the correct IDs and credentials. ' +
                'For Blob triggers, infer the real container, concrete blob path or filename default, content type, and loopback Azurite endpoint from source bindings and non-secret launch/task/emulator configuration. Do not confuse storage ports with the Functions HTTP port or inspect secret settings. ' +
                'After proposing Blob fixtures, call select_blob_invocation_file with the review and candidate IDs so I choose their files natively. File contents and paths stay private; do not request them in chat or reopen a cancelled picker without my request. ' +
                'Ask about required inputs that cannot be inferred safely. Confirm will save my selection directly in the tree. ' +
                'Do not save invocations, run requests, or upload blobs yourself. I may manually try HTTP previews and ask you to run saved HTTP requests later. Blob uploads remain separate manual actions.');
}

export async function openInvocationDebugChat(invocationId: string, debugId: string): Promise<void> {
    await openChat(
        `Debug Azure Invoke request ${invocationId}, debug authorization ${debugId}. ` +
        'Call get_http_invocation_debug_context with these IDs to inspect the explicitly shared last-run evidence. ' +
        'My local application is already running in the VS Code debugger. Do not start, attach, stop, or restart a debug session. ' +
        'Inspect the relevant application source and use Microsoft DebugMCP add_breakpoint to set a small number of useful unconditional source breakpoints. ' +
        'Explain why these locations help. Use full workspace source paths so DebugMCP targets the correct VS Code window. ' +
        'Use get_debug_status to check that the existing debugger is running before replaying. Do not resume an already paused debugger yourself. ' +
        'Then call debug_http_invocation with the same IDs to replay only the last execution snapshot, without running prerequisites. Obtain tool approval before replaying. ' +
        'Preserve its method, resolved URL, query, enabled headers, body, generated values, credentials, and bound IDs privately. Ignore later saved or unsaved edits and newer prerequisite outputs. ' +
        'Do not refresh credentials, regenerate inputs, or reset application state. A repeated mutation can legitimately return a different result, such as 409 for a duplicate registration; explain it rather than changing the request. ' +
        'If authorization expires or the snapshot is unavailable, report the blocker and require renewed authorization. Never fall back to a normal run. ' +
        'The HTTP tool waits while I inspect the breakpoint and resume execution in VS Code. It has no HTTP timeout for this explicit debug replay; I can cancel it. ' +
        'Do not change application code or request definitions as part of this captured replay. If I request a code fix, handle it separately in this chat. Do not read variable values, evaluate expressions, step, or continue execution. ' +
        'Leave execution paused for me to inspect. If DebugMCP is unavailable or the evidence points to a bad request configuration, explain the blocker or suggested correction instead of changing anything.',
    );
}

export async function openBlobInvocationDebugChat(invocationId: string, debugId: string): Promise<void> {
    await openChat(
        `Upload the saved Blob fixture for Azure Invoke invocation ${invocationId}, debug authorization ${debugId}, after setting breakpoints. ` +
        'I selected Upload with Copilot breakpoints, which already authorizes this single captured-fixture upload. ' +
        'Do not ask me to approve it again in chat, through ask_user, or through vscode/askQuestions. Use the client tool-approval UI if required. ' +
        'Call get_blob_invocation_debug_context with these IDs. The saved fixture stays private; use its metadata to locate the Blob trigger and binding configuration in source. ' +
        'If the context includes breakpointGuidance, use it when choosing source locations. It does not authorize other actions or debugger control. ' +
        'The application, Azurite, and VS Code debugger are already running. Do not start, attach, restart, or stop anything. ' +
        'Use Microsoft DebugMCP add_breakpoint to set a few useful unconditional source breakpoints showing the Blob trigger engaging. ' +
        'Explain the selected locations. Use full workspace source paths. Check get_debug_status and leave a paused debugger for me to resume manually. ' +
        'After breakpoints are set and the debugger is running, call upload_blob_invocation directly with the same id and debugId. ' +
        'Upload only the captured saved fixture. Do not edit definitions, regenerate content, run HTTP prerequisites, or substitute unsaved editor contents. ' +
        'If the captured container or blob path does not match the discovered trigger binding, briefly warn that the breakpoint may not hit, then upload the authorized fixture unchanged. Do not ask whether to proceed or change the target. ' +
        'If DebugMCP is unavailable, the fixture changes, or authorization expires, report the blocker and require renewed authorization. Never bypass it by omitting debugId or using another upload path. ' +
        'I inspect breakpoints and resume execution myself. Do not read variable values, evaluate expressions, step, or continue execution. ' +
        'Report the upload receipt separately from function execution. An upload does not prove the function ran or succeeded. ' +
        'Do not automatically upload again, reset storage, poll results, or alter application code as part of this upload. If I request a code fix, handle it separately in this chat. Briefly note that uploading overwrites any existing blob with the same name; this is not a request for another confirmation.',
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
