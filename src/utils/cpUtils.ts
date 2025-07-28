/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IAzExtOutputChannel } from '@microsoft/vscode-azext-utils';
import { AccumulatorStream, isChildProcessError, Shell, spawnStreamAsync, type CommandLineArgs, type StreamSpawnOptions } from '@microsoft/vscode-processutils';
import * as os from 'os';
import { Stream } from 'stream';
import { localize } from '../localize';

export namespace cpUtils {
    export async function executeCommand(outputChannel: IAzExtOutputChannel | undefined, workingDirectory: string | undefined, command: string, args: CommandLineArgs): Promise<string> {
        const result: ICommandResult = await tryExecuteCommand(outputChannel, workingDirectory, command, args);
        if (result.code !== 0) {
            // We want to make sure the full error message is displayed to the user, not just the error code.
            // If outputChannel is defined, then we simply call 'outputChannel.show()' and throw a generic error telling the user to check the output window
            // If outputChannel is _not_ defined, then we include the command's output in the error itself and rely on AzureActionHandler to display it properly
            if (outputChannel) {
                outputChannel.show();
                throw new Error(localize('commandErrorWithOutput', 'Failed to run "{0}" command. Check output window for more details.', command));
            } else {
                throw new Error(localize('commandError', 'Command "{0}" failed with exit code "{2}":{3}{4}', result.formattedCommandLine, result.code, os.EOL, result.cmdOutputIncludingStderr));
            }
        } else {
            if (outputChannel) {
                outputChannel.appendLog(localize('finishedRunningCommand', 'Finished running command: "{0}".', result.formattedCommandLine));
            }
        }
        return result.cmdOutput;
    }

    export async function tryExecuteCommand(outputChannel: IAzExtOutputChannel | undefined, workingDirectory: string | undefined, command: string, args: CommandLineArgs): Promise<ICommandResult> {
        const stdoutFinal = new AccumulatorStream();
        const stdoutAndErrFinal = new AccumulatorStream();

        const stdoutIntermediate = new Stream.PassThrough();
        const stderrIntermediate = new Stream.PassThrough();

        stdoutIntermediate.on('data', (chunk: Buffer) => {
            stdoutFinal.write(chunk);
            stdoutAndErrFinal.write(chunk);

            if (outputChannel) {
                outputChannel.append(bufferToString(chunk));
            }
        });

        stderrIntermediate.on('data', (chunk: Buffer) => {
            stdoutAndErrFinal.write(chunk);

            if (outputChannel) {
                outputChannel.append(bufferToString(chunk));
            }
        });

        const result: Partial<ICommandResult> = {};

        const options: StreamSpawnOptions = {
            cwd: workingDirectory || os.tmpdir(),
            shellProvider: Shell.getShellOrDefault(),
            stdOutPipe: stdoutIntermediate,
            stdErrPipe: stderrIntermediate,
            onCommand: (commandLine: string) => {
                result.formattedCommandLine = commandLine;

                if (outputChannel) {
                    outputChannel.appendLog(localize('runningCommand', 'Running command: "{0}"...', commandLine));
                }
            },
        }

        try {
            await spawnStreamAsync(command, args, options);
            result.code = 0;
        } catch (error) {
            if (isChildProcessError(error)) {
                result.code = error.code ?? 1;
            } else {
                throw error;
            }
        } finally {
            result.cmdOutput = await stdoutFinal.getString();
            result.cmdOutputIncludingStderr = await stdoutAndErrFinal.getString();
        }

        return result as ICommandResult;
    }

    export interface ICommandResult {
        code: number;
        cmdOutput: string;
        cmdOutputIncludingStderr: string;
        formattedCommandLine: string;
    }

    function bufferToString(buffer: Buffer): string {
        // Remove non-printing control characters and trailing newlines
        // eslint-disable-next-line no-control-regex
        return buffer.toString().replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F]|\r?\n$/g, '');
    }
}
