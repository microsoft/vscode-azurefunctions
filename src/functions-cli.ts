/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as vscode from 'vscode';
import { localize } from './localize';

export async function createFunction(outputChannel: vscode.OutputChannel, workingDirectory: string, templateName: string, name: string): Promise<void> {
    await executeCommand(outputChannel, workingDirectory, 'new', '--language', 'JavaScript', '--template', templateName, '--name', name);
}

export async function createNewProject(outputChannel: vscode.OutputChannel, workingDirectory: string): Promise<void> {
    await executeCommand(outputChannel, workingDirectory, 'init');
}

async function executeCommand(outputChannel: vscode.OutputChannel, workingDirectory: string, ...args: string[]): Promise<void> {
    await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
        const options: cp.SpawnOptions = {
            cwd: workingDirectory,
            shell: true
        };
        const childProc: cp.ChildProcess = cp.spawn('func', args, options);
        let stderr: string = '';
        childProc.stdout.on('data', (data: string | Buffer) => outputChannel.append(data.toString()));
        childProc.stderr.on('data', (data: string | Buffer) => stderr = stderr.concat(data.toString()));
        childProc.on('error', reject);
        childProc.on('close', (code: number) => {
            const errorMessage: string = stderr.trim();
            if (errorMessage) {
                // 'func' commands always seem to return exit code 0. For now,
                // we will use stderr to detect if an error occurs (even though stderr
                // doesn't necessarily mean there's an error)
                // https://github.com/Azure/azure-functions-cli/issues/272
                reject(new Error(errorMessage));
            } else if (code !== 0) {
                reject(new Error(localize('azFunc.funcCliCommandError', 'Command failed with exit code \'{0}\'.', code)));
            } else {
                resolve();
            }
        });
    });
}
