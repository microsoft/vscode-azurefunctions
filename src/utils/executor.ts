/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as vscode from 'vscode';
import { localize } from '../localize';

const terminal: vscode.Terminal = vscode.window.createTerminal('Azure Functions');

export function runCommandInTerminal(command: string, addNewLine: boolean = true): void {
    terminal.show();
    terminal.sendText(command, addNewLine);
}

export async function executeCommand(outputChannel: vscode.OutputChannel, workingDirectory: string, command: string, ...args: string[]): Promise<void> {
    outputChannel.show();
    await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
        const options: cp.SpawnOptions = {
            cwd: workingDirectory,
            shell: true
        };
        const childProc: cp.ChildProcess = cp.spawn(command, args, options);
        childProc.stdout.on('data', (data: string | Buffer) => outputChannel.append(data.toString()));
        childProc.stderr.on('data', (data: string | Buffer) => console.error(`Error from stderr: ${data}`));
        childProc.on('error', reject);
        childProc.on('close', (code: number) => {
            if (code !== 0) {
                reject(new Error(localize('azFunc.funcCliCommandError', 'Command failed with exit code \'{0}\'.', code)));
            } else {
                resolve();
            }
        });
    });
}
