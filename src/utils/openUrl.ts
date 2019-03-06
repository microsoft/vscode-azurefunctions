/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export async function openUrl(url: string): Promise<void> {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
}
