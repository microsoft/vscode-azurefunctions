/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as vscode from 'vscode';

export class FunctionsCli {
    constructor(private readonly _terminal: vscode.Terminal) {
    }

    async createFunction(outputChannel: vscode.OutputChannel, workingDirectory: string, templateName: string, name: string) {
        return this.executeCommand(outputChannel, workingDirectory, 'new', '--language', 'JavaScript', '--template', templateName, '--name', name);
    }

    async initFunctionApp(outputChannel: vscode.OutputChannel, workingDirectory: string) {
        return this.executeCommand(outputChannel, workingDirectory, 'init');
    }

    private executeCommand(outputChannel: vscode.OutputChannel, workingDirectory: string, ...args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const options: cp.ExecOptions = {
                cwd: workingDirectory
            };
            const childProc = cp.spawn('func', args, options);
            childProc.stdout.on('data', (data) => outputChannel.append(data.toString()));
            childProc.stderr.on('data', (data) => reject(new Error(data.toString())));
            childProc.on('error', error => reject(error));
            childProc.on('close', code => {
                code === 0 ? resolve() : reject(new Error(`Command failed with exit code '${code}'.`))
            });
        });
    }
}