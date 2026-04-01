/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { isFunctionProject } from '../../../commands/createNewProject/verifyIsProject';

/**
 * Resolves the target WorkspaceFolder for an LM tool invocation.
 *
 * Resolution order:
 *  1. If `name` is provided, find the matching folder (case-insensitive).
 *  2. If only one workspace folder is open, use it automatically.
 *  3. In multi-root workspaces with no name, if exactly one folder is a Functions project,
 *     auto-resolve to it. Otherwise return undefined — callers should respond with a
 *     LanguageModelToolResult listing available folders (see getFunctionProjectFolders).
 */
export async function pickWorkspaceFolder(
    _context: IActionContext,
    name?: string
): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders ?? [];

    if (name) {
        return folders.find(f => f.name.toLowerCase() === name.toLowerCase());
    }

    if (folders.length === 1) {
        return folders[0];
    }

    // Multi-root with no name: filter to Functions projects and auto-resolve if unambiguous.
    const functionsFolders = await getFunctionProjectFolders();
    return functionsFolders.length === 1 ? functionsFolders[0] : undefined;
}

/**
 * Returns all open workspace folders that contain a Functions project (host.json).
 * Used to build the available-folders list when pickWorkspaceFolder returns undefined.
 */
export async function getFunctionProjectFolders(): Promise<vscode.WorkspaceFolder[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const results: vscode.WorkspaceFolder[] = [];
    for (const f of folders) {
        if (await isFunctionProject(f.uri.fsPath)) {
            results.push(f);
        }
    }
    return results;
}
