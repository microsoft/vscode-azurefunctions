/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import ps = require('ps-node');
import * as vscode from 'vscode';
import { MessageItem } from 'vscode';
import { DialogResponses } from '../DialogResponses';
import { localize } from '../localize';
import { funcHostTaskId } from './createNewProject/IProjectCreator';

export async function pickFuncProcess(): Promise<string | undefined> {
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
        const startHost: vscode.MessageItem = { title: localize('startHost', 'Start Functions Host') };
        const result: MessageItem | undefined = await vscode.window.showWarningMessage(localize('funcHostNotRunning', 'You must have the Functions host running in the background before you debug.'), startHost, DialogResponses.cancel);
        if (result === startHost) {
            await vscode.commands.executeCommand('workbench.action.tasks.runTask', funcHostTaskId);
        }
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
