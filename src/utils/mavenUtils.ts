/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as vscode from 'vscode';
import * as xml2js from 'xml2js';
import { localize } from '../localize';
import { cpUtils } from './cpUtils';

export namespace mavenUtils {
    const mvnCommand: string = 'mvn';
    export async function validateMavenInstalled(workingDirectory: string): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, workingDirectory, mvnCommand, '--version');
        } catch (error) {
            throw new Error(localize('azFunc.mvnNotFound', 'Failed to find "maven" on path.'));
        }
    }

    export async function getFunctionAppNameInPom(pomLocation: string): Promise<string | undefined> {
        const pomString: string = await fse.readFile(pomLocation, 'utf-8');
        return await new Promise((resolve: (ret: string | undefined) => void): void => {
            // tslint:disable-next-line:no-any
            xml2js.parseString(pomString, { explicitArray: false }, (err: any, result: any): void => {
                if (result && !err) {
                    // tslint:disable-next-line:no-string-literal no-unsafe-any
                    if (result['project'] && result['project']['properties']) {
                        // tslint:disable-next-line:no-string-literal no-unsafe-any
                        resolve(result['project']['properties']['functionAppName']);
                        return;
                    }
                }
                resolve(undefined);
            });
        });
    }

    export async function executeMvnCommand(outputChannel: vscode.OutputChannel | undefined, workingDirectory: string | undefined, ...args: string[]): Promise<string> {
        const mavenExecutor: MavenCommandExecutor = new MavenCommandExecutor(outputChannel, workingDirectory, mvnCommand, args);
        return await mavenExecutor.execute();
    }

    class MavenCommandExecutor extends cpUtils.ChildProcessExecutor {
        protected onCloseCallback(code: number, resolve: () => void, reject: (e: Error) => void): void {
            if (code !== 0) {
                const mvnErrorRegexp: RegExp = new RegExp(/^\[ERROR\](.*)$/, 'gm');
                const linesWithErrors: RegExpMatchArray | null = this.cmdOutputIncludingStderr.match(mvnErrorRegexp);
                let errorOutput: string = '';
                if (linesWithErrors !== null) {
                    for (const line of linesWithErrors) {
                        errorOutput += `${line.trim() ? line.trim() : ''}\n`;
                    }
                }
                errorOutput = errorOutput.replace(/^\[ERROR\]/gm, '');
                reject(new Error(localize('azFunc.mavenCommandError', 'Error occurs when executing "mvn".{0}{1}', os.EOL, errorOutput)));
            } else {
                if (this.outputChannel) {
                    this.outputChannel.appendLine(localize('finishedRunningCommand', 'Finished running command: "{0} {1}".', mvnCommand, this.formattedArgs));
                }
                resolve();
            }
        }
    }
}
