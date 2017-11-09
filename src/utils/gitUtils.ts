/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { cpUtils } from './cpUtils';

export namespace gitUtils {
    const gitCommand: string = 'git';
    export async function isGitInstalled(workingDirectory: string): Promise<boolean> {
        try {
            await cpUtils.executeCommand(undefined, workingDirectory, gitCommand, '--version');
            return true;
        } catch {
            return false;
        }
    }

    export async function gitInit(outputChannel: vscode.OutputChannel, workingDirectory: string): Promise<void> {
        await cpUtils.executeCommand(outputChannel, workingDirectory, gitCommand, 'init');
    }
}
