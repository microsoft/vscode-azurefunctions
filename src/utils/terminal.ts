/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const terminal: vscode.Terminal = vscode.window.createTerminal('Azure Functions');

// tslint:disable-next-line:export-name
export function runCommandInTerminal(command: string, addNewLine: boolean = true): void {
    terminal.show();
    terminal.sendText(command, addNewLine);
}
