/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import ps = require('ps-node');
import * as vscode from 'vscode';
import { localize } from '../localize';
import { funcHostTaskId } from './createNewProject/IProjectCreator';

export async function pickFuncProcess(): Promise<string | undefined> {
    let funcProcess: string | undefined = await getFuncPid();

    if (funcProcess === undefined) {
        // If the functions host isn't running, start the task for the user
        await vscode.commands.executeCommand('workbench.action.tasks.runTask', funcHostTaskId);

        const timeout: number = 15;
        const maxTime: number = Date.now() + timeout * 1000;
        while (Date.now() < maxTime) {
            // Wait one second between each attempt
            await new Promise((resolve: () => void): void => { setTimeout(resolve, 1000); });

            funcProcess = await getFuncPid();
            if (funcProcess !== undefined) {
                return funcProcess;
            }
        }

        throw new Error(localize('failedToFindFuncHost', 'Failed to detect running Functions host within "{0}" seconds.', timeout));
    } else {
        return funcProcess;
    }
}

async function getFuncPid(): Promise<string | undefined> {
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
        throw new Error(localize('multipleFuncHost', 'Detected multiple processes running the Functions host. Stop all but one process in order to debug.'));
    }
}

interface IProcess {
    pid: string;
}
