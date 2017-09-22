/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class FunctionsCli {
    constructor(private readonly _terminal: vscode.Terminal) {
    }

    createFunction(rootPath: string, templateName: string, name: string) {
        this.executeCommand(rootPath, `func new --language JavaScript --template ${templateName} --name ${name}`);
    }

    async initFunctionApp(rootPath: string) {
        this.executeCommand(rootPath, `func init`);
    }

    private executeCommand(rootPath: string, command: string) {
        this._terminal.sendText(`cd "${rootPath}"`);
        this._terminal.sendText(command);
    }
}