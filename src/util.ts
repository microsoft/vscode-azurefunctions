/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reporter } from './telemetry';
import * as vscode from 'vscode';

export function sendTelemetry(eventName: string, properties?: { [key: string]: string; }, measures?: { [key: string]: number; }) {
    if (reporter) {
        reporter.sendTelemetryEvent(eventName, properties, measures);
    }
}

export function errorToString(error: any): string | undefined {
    if (error) {
        if (error instanceof Error) {
            return JSON.stringify({
                'Error': error.constructor.name,
                'Message': error.message
            });
        }

        if (typeof (error) === 'object') {
            return JSON.stringify({
                'object': error.constructor.name
            });
        }

        return error.toString();
    }
}

export async function showQuickPick<T>(items: QuickPickItemWithData<T>[] | Thenable<QuickPickItemWithData<T>[]>, placeHolder: string, token?: vscode.CancellationToken): Promise<QuickPickItemWithData<T>> {
    const options: vscode.QuickPickOptions = {
        placeHolder: placeHolder,
        ignoreFocusOut: true
    }
    const result = await vscode.window.showQuickPick(items, options, token);

    if (!result) {
        throw new UserCancelledError();
    }

    return result;
}

export async function showInputBox(placeHolder: string, prompt: string): Promise<string> {
    const options: vscode.InputBoxOptions = {
        placeHolder: placeHolder,
        prompt: prompt,
        // TODO: validateInput
        ignoreFocusOut: true
    }
    const result = await vscode.window.showInputBox(options);

    if (!result) {
        throw new UserCancelledError();
    }

    return result;
}

export class QuickPickItemWithData<T> implements vscode.QuickPickItem {
    readonly description: string;
    constructor(readonly label: string, description?: string, readonly data?: T) {
        this.description = description ? description : '';
    }
}

export class UserCancelledError extends Error { }