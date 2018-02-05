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
        await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
            const options: cp.SpawnOptions = {
                cwd: workingDirectory,
                shell: true
            };
            const childProc: cp.ChildProcess = cp.spawn(command, args, options);

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
                if (code !== 0 && command !== 'npm') {
                    reject(new Error(localize('azFunc.commandError', 'Command "{0} {1}" failed with exit code "{2}".', command, args.toString(), code)));
                } else {
                    resolve();
                }
            });
        });

        return result;
    }
}
