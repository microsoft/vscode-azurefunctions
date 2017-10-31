/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IUserInterface, Pick, PickWithData } from '../src/IUserInterface';

export class TestUI implements IUserInterface {
    private _inputs: (string | undefined)[];

    constructor(inputs: (string | undefined)[]) {
        this._inputs = inputs;
    }

    public async showQuickPick<T>(items: PickWithData<T>[] | Thenable<PickWithData<T>[]>, placeHolder: string, ignoreFocusOut?: boolean): Promise<PickWithData<T>>;
    public async showQuickPick(items: Pick[] | Thenable<Pick[]>, placeHolder: string, ignoreFocusOut?: boolean): Promise<Pick>;
    public async showQuickPick(items: vscode.QuickPickItem[] | Thenable<vscode.QuickPickItem[]>, placeHolder: string, _ignoreFocusOut: boolean = false): Promise<vscode.QuickPickItem> {
        if (this._inputs.length > 0) {
            const input: string | undefined = this._inputs.shift();
            const resolvedItems: vscode.QuickPickItem[] = await Promise.resolve(items);

            if (resolvedItems.length === 0) {
                throw new Error(`No quick pick items found. Placeholder: '${placeHolder}'`);
            } else if (input) {
                const resolvedItem: vscode.QuickPickItem | undefined = resolvedItems.find((qpi: vscode.QuickPickItem) => qpi.label === input);
                if (resolvedItem) {
                    return resolvedItem;
                } else {
                    throw new Error(`Did not find quick pick item matching '${input}'. Placeholder: '${placeHolder}'`);
                }
            } else {
                // Use default value if input is undefined
                return resolvedItems[0];
            }
        }

        throw new Error(`Unexpected call to showQuickPick. Placeholder: '${placeHolder}'`);
    }

    public async showInputBox(placeHolder: string, prompt: string, _ignoreFocusOut: boolean = false, validateInput?: (s: string) => string | undefined | null, value?: string): Promise<string> {
        if (this._inputs.length > 0) {
            let result: string | undefined = this._inputs.shift();
            if (!result) {
                // Use default value if input is undefined
                result = value;
            }

            if (result) {
                if (validateInput) {
                    const msg: string | null | undefined = validateInput(result);
                    if (msg !== null && msg !== undefined) {
                        throw new Error(msg);
                    }
                }

                return result;
            }
        }

        throw new Error(`Unexpected call to showInputBox. Placeholder: '${placeHolder}'. Prompt: '${prompt}'`);
    }

    public async showFolderDialog(): Promise<string> {
        if (this._inputs.length > 0) {
            const result: string | undefined = this._inputs.shift();
            if (result) {
                return result;
            }
        }

        throw new Error('Unexpected call to showFolderDialog');
    }
}
