/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as vscode from 'vscode';

export class FunctionsCli {
    constructor(private readonly _terminal: vscode.Terminal) {
    }

    createFunction(workingDirectory: string, templateName: string, name: string): Promise<string> {
        return this.executeCommand(workingDirectory, `func new --language JavaScript --template ${templateName} --name ${name}`);
    }

    initFunctionApp(workingDirectory: string): Promise<string> {
        return this.executeCommand(workingDirectory, `func init`);
    }

    private executeCommand(workingDirectory: string, command: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const options: cp.ExecOptions = {
                cwd: workingDirectory
            };
            // TODO: Verify special characters are escaped properly
            cp.exec(command, options, (error, stdout, stderr) => {
                // TODO: Verify errors are caught correctly and decide what to do with stderr
                error ? reject(error) : resolve(stdout);
            });
        });
    }
}