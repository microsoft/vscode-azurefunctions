/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as util from './util';

export class FunctionsCli {
    constructor(private readonly _terminal: vscode.Terminal) {
    }

    createFunction(templateName: string, name: string) {
        this.executeCommand(`func new --language JavaScript --template ${templateName} --name ${name}`);
    }

    async initFunctionApp(name: string) {
        this.executeCommand(`func init`);
    }

    private executeCommand(command: string) {
        // TODO: Verify terminal is in current working folder
        this._terminal.show();
        this._terminal.sendText(command);
    }
}