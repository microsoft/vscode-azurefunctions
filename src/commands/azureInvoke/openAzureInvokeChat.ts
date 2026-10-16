/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';

export async function openAzureInvokeChat(reviewId: string, revision?: number): Promise<void> {
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            mode: 'Azure Invoke',
            query: revision !== undefined ?
                `Revise Azure Invoke collection review ${reviewId}, revision ${revision}. ` +
                'Call get_invocation_collection_review to read the submitted feedback, selected flags, and private-edit field names. ' +
                'Apply the feedback and call propose_invocation_collection with the same reviewId, the returned revision, and the complete revised candidate list. ' +
                'Keep stable IDs for existing cases and preserve unchecked selections. Do not draft, save, or run requests. Stop after refreshing the review so I can confirm or request more changes.' :
                `Help me author Azure Invoke collection review ${reviewId}. Scan all projects in this workspace for triggers and HTTP endpoints. ` +
                'Use propose_invocation_collection with that review ID to fill the loading page with grouped, runnable HTTP requests. ' +
                'For GET requests, inspect handlers, query models, and parsing helpers for filters, pagination, sorting, and route IDs. Include all discovered query names and link instance IDs when possible. ' +
                'Populate body fields with valid synthetic values, use {{guid}} where uniqueness is required, and author dependencies and request/response bindings so later requests reuse the correct IDs and credentials. ' +
                'Ask about required inputs that cannot be inferred safely. Confirm will save my selection directly in the tree. ' +
                'Do not save invocations or run requests yourself. I may manually try previews and ask you to run the saved collection later.',
        });
    } catch (error) {
        if (isUserCancelledError(error)) {
            throw error;
        }
        // eslint-disable-next-line preserve-caught-error -- Native chat errors may contain workspace or request details.
        throw new Error(localize('azureInvoke.chatUnavailable', 'Could not open Copilot Chat. Enable GitHub Copilot Chat and try again.'));
    }
}
