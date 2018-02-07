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
        let result: string = '';
        workingDirectory = workingDirectory || os.tmpdir();
        const formattedArgs: string = args.join(' ');
        await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
            const options: cp.SpawnOptions = {
                cwd: workingDirectory,
                shell: true
            };
            const childProc: cp.ChildProcess = cp.spawn(command, args, options);

            if (outputChannel) {
                outputChannel.appendLine(localize('runningCommand', 'Running command: "{0} {1}"...', command, formattedArgs));
            }

            childProc.stdout.on('data', (data: string | Buffer) => {
                data = data.toString();
                result = result.concat(data);
                if (outputChannel) {
                    outputChannel.append(data);
                }
            });

            if (outputChannel) {
                childProc.stderr.on('data', (data: string | Buffer) => outputChannel.append(data.toString()));
            }

            childProc.on('error', reject);
            childProc.on('close', (code: number) => {
                if (code !== 0) {
                    if (outputChannel) {
                        outputChannel.show();
                        reject(new Error(localize('azFunc.commandErrorWithOutput', 'Failed to run "{0}" command. Check output window for more details.', command)));
                    } else {
                        // Include as much information as possible in the error since we couldn't display it directly in the outputChannel
                        // The AzureActionHandler will handle this multi-line error and display it in the outputChannel anyways
                        reject(new Error(localize('azFunc.commandError', 'Command "{0} {1}" failed with exit code "{2}":{3}{4}', command, formattedArgs, code, os.EOL, result)));
                    }
                } else {
                    if (outputChannel) {
                        outputChannel.appendLine(localize('finishedRunningCommand', 'Finished running command: "{0} {1}".', command, formattedArgs));
                    }
                    resolve();
                }
            });
        });

        return result;
    }
}
