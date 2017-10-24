/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as errors from './errors';
import { IUserInterface, Pick, PickWithData } from './IUserInterface';
import { localize } from './localize';

export class VSCodeUI implements IUserInterface {
    public async showQuickPick<T>(items: PickWithData<T>[] | Thenable<PickWithData<T>[]>, placeHolder: string, ignoreFocusOut?: boolean): Promise<PickWithData<T>>;
    public async showQuickPick(items: Pick[] | Thenable<Pick[]>, placeHolder: string, ignoreFocusOut?: boolean): Promise<Pick>;
    public async showQuickPick(items: vscode.QuickPickItem[] | Thenable<vscode.QuickPickItem[]>, placeHolder: string, ignoreFocusOut: boolean = false): Promise<vscode.QuickPickItem> {
        const options: vscode.QuickPickOptions = {
            placeHolder: placeHolder,
            ignoreFocusOut: ignoreFocusOut
        };
        const result: vscode.QuickPickItem | undefined = await vscode.window.showQuickPick(items, options);

        if (!result) {
            throw new errors.UserCancelledError();
        } else {
            return result;
        }
    }

    public async showInputBox(placeHolder: string, prompt: string, ignoreFocusOut: boolean = false, validateInput?: (s: string) => string | undefined | null, defaultValue?: string): Promise<string> {
        const options: vscode.InputBoxOptions = {
            placeHolder: placeHolder,
            prompt: prompt,
            validateInput: validateInput,
            ignoreFocusOut: ignoreFocusOut,
            value: defaultValue
        };
        const result: string | undefined = await vscode.window.showInputBox(options);

        if (!result) {
            throw new errors.UserCancelledError();
        } else {
            return result;
        }
    }

    public async showFolderDialog(): Promise<string> {
        const defaultUri: vscode.Uri | undefined = vscode.workspace.rootPath ? vscode.Uri.file(vscode.workspace.rootPath) : undefined;
        const options: vscode.OpenDialogOptions = {
            defaultUri: defaultUri,
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: localize('azFunc.select', 'Select')
        };
        const result: vscode.Uri[] | undefined = await vscode.window.showOpenDialog(options);

        if (!result || result.length === 0) {
            throw new errors.UserCancelledError();
        } else {
            return result[0].fsPath;
        }
    }
}
