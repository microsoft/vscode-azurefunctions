/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import ps = require('ps-node');
import * as vscode from 'vscode';
import { isWindows } from '../constants';
import { localize } from '../localize';
import { extensionPrefix, getFuncExtensionSetting } from '../ProjectSettings';
import { cpUtils } from '../utils/cpUtils';
import { funcHostTaskId } from './createNewProject/IProjectCreator';

export async function pickFuncProcess(): Promise<string | undefined> {
    let funcHostPid: string | undefined = await getFuncHostPid();
    if (funcHostPid !== undefined) {
        // Stop the functions host to prevent build errors like "Cannot access the file '...' because it is being used by another process."
        await killProcess(funcHostPid);
    }

    // Start (or restart) functions host (which will also trigger a build)
    await vscode.commands.executeCommand('workbench.action.tasks.runTask', funcHostTaskId);

    const settingKey: string = 'pickFuncProcessTimeout';
    const settingValue: number | undefined = getFuncExtensionSetting<number>(settingKey);
    const timeoutInSeconds: number = Number(settingValue);
    if (isNaN(timeoutInSeconds)) {
        throw new Error(localize('invalidSettingValue', 'The setting "{0}" must be a number, but instead found "{1}".', settingKey, settingValue));
    }

    const maxTime: number = Date.now() + timeoutInSeconds * 1000;
    while (Date.now() < maxTime) {
        // Wait one second between each attempt
        // NOTE: Intentionally waiting at the beginning of the loop since we don't want to attach to the process we just stopped above
        await new Promise((resolve: () => void): void => { setTimeout(resolve, 1000); });

        funcHostPid = await getFuncHostPid();
        if (funcHostPid !== undefined) {
            return funcHostPid;
        }
    }

    throw new Error(localize('failedToFindFuncHost', 'Failed to detect running Functions host within "{0}" seconds. You may want to adjust the "{1}" setting.', timeoutInSeconds, `${extensionPrefix}.${settingKey}`));
}

async function getFuncHostPid(): Promise<string | undefined> {
    const multipleProcError: Error = new Error(localize('multipleFuncHost', 'Detected multiple processes running the Functions host. Stop all but one process in order to debug.'));
    if (isWindows) {
        // Ideally we could use 'ps.lookup' for all OS's, but unfortunately it's very slow on windows
        // Instead, we will call 'wmic' manually and parse the results
        const processList: string = await cpUtils.executeCommand(undefined, undefined, 'wmic', 'process', 'get', 'CommandLine,Name,ProcessId', '/FORMAT:csv');
        const regExp: RegExp = new RegExp(/^.*,.*azure.*functions.*host.*start.*,(?:dotnet\.exe|func.*\.exe),(\d+)$/gmi);
        const matches: RegExpMatchArray | null = regExp.exec(processList);
        if (matches === null) {
            return undefined;
        } else if (matches.length === 2) {
            return matches[1];
        } else {
            throw multipleProcError;
        }
    } else {
        const processList: IProcess[] = await new Promise((resolve: (processList: IProcess[]) => void, reject: (e: Error) => void): void => {
            //tslint:disable-next-line:no-unsafe-any
            ps.lookup(
                {
                    command: '.*dotnet.*',
                    arguments: '.*Azure\.Functions.*host.*start'
                },
                (error: Error | undefined, result: IProcess[]): void => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                });
        });

        if (processList.length === 0) {
            return undefined;
        } else if (processList.length === 1) {
            return processList[0].pid;
        } else {
            throw multipleProcError;
        }
    }
}

interface IProcess {
    pid: string;
}

async function killProcess(pid: string, timeoutInSeconds: number = 60): Promise<void> {
    if (isWindows) {
        // Just like 'ps.lookup', 'ps.kill' is very slow on windows
        // We can use it to kill the process, but we have to implement our own 'wait' logic to make sure the process actually stopped
        //tslint:disable-next-line:no-unsafe-any
        ps.kill(pid);
        const maxTime: number = Date.now() + timeoutInSeconds * 1000;
        while (Date.now() < maxTime) {
            // Wait one second between each attempt
            await new Promise((resolve: () => void): void => { setTimeout(resolve, 1000); });

            const oldProcess: string = await cpUtils.executeCommand(undefined, undefined, 'wmic', 'process', 'where', `ProcessId="${pid}"`, 'get', 'ProcessId', '/FORMAT:csv');
            if (oldProcess.indexOf(pid) === -1) {
                return;
            }
        }

        throw new Error(localize('failedToTerminateProcess', 'Failed to terminate process with pid "{0}" in "{1}" seconds.', pid, timeoutInSeconds));
    } else {
        await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
            //tslint:disable-next-line:no-unsafe-any
            ps.kill(pid, (err: Error | undefined) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}
