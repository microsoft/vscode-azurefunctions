/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, DialogResponses, type IActionContext, type IAzExtOutputChannel, type TelemetryProperties } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import * as xml2js from 'xml2js';
import { localize } from '../localize';
import { cpUtils } from './cpUtils';
import { openUrl } from './openUrl';

export namespace mavenUtils {
    const mvnCommand: string = 'mvn';
    export async function validateMavenInstalled(context: IActionContext): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, undefined, mvnCommand, '--version');
        } catch (error) {
            const message: string = localize('mvnNotFound', 'Failed to find "maven", please ensure that the maven bin directory is in your system path.');

            if (!context.errorHandling.suppressDisplay) {
                // don't wait
                void vscode.window.showErrorMessage(message, DialogResponses.learnMore).then(async result => {
                    if (result === DialogResponses.learnMore) {
                        await openUrl('https://aka.ms/azurefunction_maven');
                    }
                });
                context.errorHandling.suppressDisplay = true;
            }

            throw new Error(message);
        }
    }

    export async function getFunctionAppNameInPom(pomLocation: string): Promise<string | undefined> {
        const pomString: string = await AzExtFsExtra.readFile(pomLocation);
        return await new Promise((resolve: (ret: string | undefined) => void): void => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            xml2js.parseString(pomString, { explicitArray: false }, (err: any, result: any): void => {
                if (result && !err) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    if (result['project'] && result['project']['properties']) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        resolve(result['project']['properties']['functionAppName'] as string | undefined);
                        return;
                    }
                }
                resolve(undefined);
            });
        });
    }

    export async function executeMvnCommand(telemetryProperties: TelemetryProperties | undefined, outputChannel: IAzExtOutputChannel | undefined, workingDirectory: string | undefined, ...args: string[]): Promise<string> {
        const result: cpUtils.ICommandResult = await cpUtils.tryExecuteCommand(outputChannel, workingDirectory, mvnCommand, ...args);
        if (result.code !== 0) {
            const mvnErrorRegexp: RegExp = new RegExp(/^\[ERROR\](.*)$/, 'gm');
            const linesWithErrors: RegExpMatchArray | null = result.cmdOutputIncludingStderr.match(mvnErrorRegexp);
            let errorOutput: string = '';
            if (linesWithErrors !== null) {
                for (const line of linesWithErrors) {
                    errorOutput += `${line.trim() ? line.trim() : ''}\n`;
                }
            }
            errorOutput = errorOutput.replace(/^\[ERROR\]/gm, '');
            if (telemetryProperties) {
                telemetryProperties.mavenErrors = errorOutput;
            }
            if (outputChannel) {
                outputChannel.show();
                throw new Error(localize('commandErrorWithOutput', 'Failed to run "{0}" command. Check output window for more details.', mvnCommand));
            }
        } else {
            if (outputChannel) {
                outputChannel.appendLine(localize('finishedRunningCommand', 'Finished running command: "{0} {1}".', mvnCommand, result.formattedArgs));
            }
        }
        return result.cmdOutput;
    }

    export function formatMavenArg(key: string, value: string | number | boolean): string {
        return `-${key}=${cpUtils.wrapArgInQuotes(value)}`;
    }
}
