/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../localize';

/**
 * Starts a new Azure Invoke chat to build invocations without running them.
 */
export async function buildInvocationsWithCopilot(): Promise<void> {
    const query = localize('azureInvoke.buildInvocationsPrompt',
        'Scan my local project for triggers and API endpoints. If several projects are available, ask which one to scan. ' +
        'Add invocations for the supported triggers and endpoints that do not already have one. Keep my existing collection. ' +
        'Summarize what you added and skipped. Do not run invocations or edit project files.');
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', { mode: 'Azure Invoke', query, newSession: true });
    } catch (error) {
        if (isUserCancelledError(error)) {
            throw error;
        }
        // eslint-disable-next-line preserve-caught-error -- Native chat errors may contain workspace details.
        throw new Error(localize('azureInvoke.chatUnavailable', 'Could not open Copilot Chat. Enable GitHub Copilot Chat and try again, or create an invocation manually.'));
    }
}
