/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import { localize } from '../localize';

export namespace cpUtils {
    export async function executeCommand(outputChannel: vscode.OutputChannel | undefined, workingDirectory: string | undefined, command: string, ...args: string[]): Promise<string> {
        const childProcessExecutor: ChildProcessExecutor = new ChildProcessExecutor(outputChannel, workingDirectory, command, args);
        return await childProcessExecutor.execute();
    }

    export class ChildProcessExecutor {
        protected outputChannel: vscode.OutputChannel | undefined;
        protected workingDirectory: string | undefined;
        protected command: string;
        protected args: string[];
        protected cmdOutput: string;
        protected cmdOutputIncludingStderr: string;
        protected formattedArgs: string;

        constructor(outputChannel: vscode.OutputChannel | undefined, workingDirectory: string | undefined, command: string, args: string[]) {
            this.outputChannel = outputChannel;
            this.workingDirectory = workingDirectory || os.tmpdir();
            this.command = command;
            this.args = args;
            this.cmdOutput = '';
            this.cmdOutputIncludingStderr = '';
            this.formattedArgs = args.join(' ');
        }

        public async execute(): Promise<string> {
            await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
                const options: cp.SpawnOptions = {
                    cwd: this.workingDirectory,
                    shell: true
                };
                const childProc: cp.ChildProcess = cp.spawn(this.command, this.args, options);

                if (this.outputChannel) {
                    this.outputChannel.appendLine(localize('runningCommand', 'Running command: "{0} {1}"...', this.command, this.formattedArgs));
                }

                childProc.stdout.on('data', (data: string | Buffer) => {
                    data = data.toString();
                    this.cmdOutput = this.cmdOutput.concat(data);
                    this.cmdOutputIncludingStderr = this.cmdOutputIncludingStderr.concat(data);
                    if (this.outputChannel) {
                        this.outputChannel.append(data);
                    }
                });

                childProc.stderr.on('data', (data: string | Buffer) => {
                    data = data.toString();
                    this.cmdOutputIncludingStderr = this.cmdOutputIncludingStderr.concat(data);
                    if (this.outputChannel) {
                        this.outputChannel.append(data);
                    }
                });

                childProc.on('error', (err: Error) => {
                    this.onErrorCallback(err, reject);
                });

                childProc.on('close', (code: number) => {
                    this.onCloseCallback(code, resolve, reject);
                });
            });

            return this.cmdOutput;
        }

        protected onCloseCallback(code: number, resolve: () => void, reject: (e: Error) => void): void {
            if (code !== 0) {
                // We want to make sure the full error message is displayed to the user, not just the error code.
                // If outputChannel is defined, then we simply call 'outputChannel.show()' and throw a generic error telling the user to check the output window
                // If outputChannel is _not_ defined, then we include the command's output in the error itself and rely on AzureActionHandler to display it properly
                if (this.outputChannel) {
                    this.outputChannel.show();
                    reject(new Error(localize('azFunc.commandErrorWithOutput', 'Failed to run "{0}" command. Check output window for more details.', this.command)));
                } else {
                    reject(new Error(localize('azFunc.commandError', 'Command "{0} {1}" failed with exit code "{2}":{3}{4}', this.command, this.formattedArgs, code, os.EOL, this.cmdOutputIncludingStderr)));
                }
            } else {
                if (this.outputChannel) {
                    this.outputChannel.appendLine(localize('finishedRunningCommand', 'Finished running command: "{0} {1}".', this.command, this.formattedArgs));
                }
                resolve();
            }
        }

        protected onErrorCallback(err: Error, reject: (e: Error) => void): void {
            reject(err);
        }
    }
}
