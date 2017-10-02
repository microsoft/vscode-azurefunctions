/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:import-name no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import * as fs from 'fs';
import * as vscode from 'vscode';
import { QuickPickItem } from 'vscode';
import { Site } from '../node_modules/azure-arm-website/lib/models';
import * as errors from './errors';

export function errorToString(error: {}): string | undefined {
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

export async function showQuickPick<T>(items: QuickPickItemWithData<T>[] | Thenable<QuickPickItemWithData<T>[]>, placeHolder: string, ignoreFocusOut?: boolean): Promise<QuickPickItemWithData<T>>;
export async function showQuickPick(items: GenericQuickPickItem[] | Thenable<GenericQuickPickItem[]>, placeHolder: string, ignoreFocusOut?: boolean): Promise<GenericQuickPickItem>;
export async function showQuickPick(items: vscode.QuickPickItem[] | Thenable<vscode.QuickPickItem[]>, placeHolder: string, ignoreFocusOut: boolean = false): Promise<vscode.QuickPickItem> {
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

export async function showInputBox(placeHolder: string, prompt: string, ignoreFocusOut: boolean = false, validateInput?: (s: string) => string | undefined | null): Promise<string> {
    const options: vscode.InputBoxOptions = {
        placeHolder: placeHolder,
        prompt: prompt,
        validateInput: validateInput,
        ignoreFocusOut: ignoreFocusOut
    };
    const result: string | undefined = await vscode.window.showInputBox(options);

    if (!result) {
        throw new errors.UserCancelledError();
    } else {
        return result;
    }
}

export async function showFolderDialog(): Promise<string> {
    const defaultUri: vscode.Uri | undefined = vscode.workspace.rootPath ? vscode.Uri.file(vscode.workspace.rootPath) : undefined;
    const options: vscode.OpenDialogOptions = {
        defaultUri: defaultUri,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select'
    };
    const result: vscode.Uri[] | undefined = await vscode.window.showOpenDialog(options);

    if (!result || result.length === 0) {
        throw new errors.UserCancelledError();
    } else {
        return result[0].fsPath;
    }
}

export enum FunctionAppState {
    Stopped = 'stopped',
    Running = 'running'
}

export async function waitForFunctionAppState(webSiteManagementClient: WebSiteManagementClient, resourceGroup: string, name: string, state: FunctionAppState, intervalMs: number = 5000, timeoutMs: number = 60000): Promise<void> {
    let count: number = 0;
    while (count < timeoutMs) {
        count += intervalMs;
        const currentSite: Site = await webSiteManagementClient.webApps.get(resourceGroup, name);
        if (currentSite.state && currentSite.state.toLowerCase() === state) {
            return;
        }
        await new Promise((r: () => void): NodeJS.Timer => setTimeout(r, intervalMs));
    }
    throw new Error(`Timeout waiting for Function App "${name}" state "${state}".`);
}

export class GenericQuickPickItem implements QuickPickItem {
    public readonly description: string;
    public readonly label: string;
    constructor(label: string, description?: string) {
        this.label = label;
        this.description = description ? description : '';
    }
}

export class QuickPickItemWithData<T> extends GenericQuickPickItem {
    public readonly data: T;
    constructor(data: T, label: string, description?: string) {
        super(label, description);
        this.data = data;
    }
}

export async function writeToFile(path: string, data: string): Promise<void> {
    await new Promise((resolve: () => void, reject: (e: {}) => void): void => {
        fs.writeFile(path, data, (error?: Error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}
