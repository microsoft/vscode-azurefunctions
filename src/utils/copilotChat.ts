/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { localize } from '../localize';

/**
 * Best-effort helper to open GitHub Copilot Chat with a pre-filled prompt.
 *
 * VS Code command IDs and argument shapes have evolved over time, so we try a few.
 */
export async function openCopilotChat(prompt: string): Promise<void> {
    const trimmed = (prompt ?? '').trim();
    if (!trimmed) {
        return;
    }

    const candidates: Array<{ command: string; args: unknown[] }> = [
        // Newer VS Code variants
        { command: 'workbench.action.chat.open', args: [trimmed] },
        { command: 'workbench.action.chat.open', args: [{ query: trimmed }] },
        // Older / alternate variants
        { command: 'workbench.action.openChat', args: [trimmed] },
        // Copilot extensions (IDs vary by version)
        { command: 'github.copilot.openChat', args: [trimmed] },
        { command: 'github.copilot-chat.openChat', args: [trimmed] },
    ];

    for (const { command, args } of candidates) {
        try {
            await vscode.commands.executeCommand(command, ...args);
            return;
        } catch {
            // Ignore and try the next candidate
        }
    }

    void vscode.window.showWarningMessage(localize(
        'funcHostDebug.copilotChatUnavailable',
        'Unable to open Copilot Chat. Please ensure GitHub Copilot Chat is installed and enabled.'
    ));
}
