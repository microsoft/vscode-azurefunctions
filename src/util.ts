/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import WebSiteManagementClient = require('azure-arm-website');
import * as fs from 'fs';
import * as vscode from 'vscode';
import { reporter } from './telemetry';

export function sendTelemetry(eventName: string, properties?: { [key: string]: string; }, measures?: { [key: string]: number; }) {
    if (reporter) {
        reporter.sendTelemetryEvent(eventName, properties, measures);
    }
}

export function errorToString(error: {}): string | undefined {
    if (error) {
        if (error instanceof Error) {
            return JSON.stringify({
                Error: error.constructor.name,
                Message: error.message
            });
        }

        if (typeof (error) === 'object') {
            return JSON.stringify({
                object: error.constructor.name
            });
        }
    }
}

export async function showQuickPick<T>(items: QuickPickItemWithData<T>[] | Thenable<QuickPickItemWithData<T>[]>, placeHolder: string, ignoreFocusOut?: boolean): Promise<QuickPickItemWithData<T>>;
export async function showQuickPick(items: QuickPickItem[] | Thenable<QuickPickItem[]>, placeHolder: string, ignoreFocusOut?: boolean): Promise<QuickPickItem>;
export async function showQuickPick(items: vscode.QuickPickItem[] | Thenable<vscode.QuickPickItem[]>, placeHolder: string, ignoreFocusOut = false): Promise<vscode.QuickPickItem> {
    const options: vscode.QuickPickOptions = {
        placeHolder: placeHolder,
        ignoreFocusOut: ignoreFocusOut
    };
    const result = await vscode.window.showQuickPick(items, options);

    if (!result) {
        throw new UserCancelledError();
    } else {
        return result;
    }
}

export async function showInputBox(placeHolder: string, prompt: string, ignoreFocusOut = false, validateInput?: (s: string) => string | undefined | null): Promise<string> {
    const options: vscode.InputBoxOptions = {
        placeHolder: placeHolder,
        prompt: prompt,
        validateInput: validateInput,
        ignoreFocusOut: ignoreFocusOut
    };
    const result = await vscode.window.showInputBox(options);

    if (!result) {
        throw new UserCancelledError();
    } else {
        return result;
    }
}

export async function showFolderDialog(): Promise<string> {
    const defaultUri = vscode.workspace.rootPath ? vscode.Uri.file(vscode.workspace.rootPath) : undefined;
    const options: vscode.OpenDialogOptions = {
        defaultUri: defaultUri,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select'
    };
    const result = await vscode.window.showOpenDialog(options);

    if (!result || result.length === 0) {
        throw new UserCancelledError();
    } else {
        return result[0].fsPath;
    }
}

export enum FunctionAppState {
    Stopped = 'stopped',
    Running = 'running'
}

export async function waitForFunctionAppState(webSiteManagementClient: WebSiteManagementClient, resourceGroup: string, name: string, state: FunctionAppState, intervalMs = 5000, timeoutMs = 60000) {
    let count = 0;
    while (count < timeoutMs) {
        count += intervalMs;
        const currentSite = await webSiteManagementClient.webApps.get(resourceGroup, name);
        if (currentSite.state && currentSite.state.toLowerCase() === state) {
            return;
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Timeout waiting for Function App "${name}" state "${state}".`);
}

export class QuickPickItem implements vscode.QuickPickItem {
    public readonly description: string;
    constructor(readonly label: string, description?: string) {
        this.description = description ? description : '';
    }
}

export class QuickPickItemWithData<T> extends QuickPickItem {
    public readonly data: T;
    constructor(data: T, readonly label: string, description?: string) {
        super(label, description);
        this.data = data;
    }
}

export function writeToFile(path: string, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
        fs.writeFile(path, data, (error) => {
            error ? reject(error) : resolve();
        });
    });
}

export class UserCancelledError extends Error { }

export class NoWorkspaceError extends Error {
    public message = 'You must have a workspace open to perform this operation.';
}
