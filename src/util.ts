/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { Site } from 'azure-arm-website/lib/models';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { QuickPickItem } from 'vscode';
import * as nls from 'vscode-nls';
import * as errors from './errors';

export const localize: nls.LocalizeFunc = nls.config(process.env.VSCODE_NLS_CONFIG)();

export async function showQuickPick<T>(items: PickWithData<T>[] | Thenable<PickWithData<T>[]>, placeHolder: string, ignoreFocusOut?: boolean): Promise<PickWithData<T>>;
export async function showQuickPick(items: Pick[] | Thenable<Pick[]>, placeHolder: string, ignoreFocusOut?: boolean): Promise<Pick>;
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
        openLabel: localize('azFunc.select', 'Select')
    };
    const result: vscode.Uri[] | undefined = await vscode.window.showOpenDialog(options);

    if (!result || result.length === 0) {
        throw new errors.UserCancelledError();
    } else {
        return result[0].fsPath;
    }
}

export enum FunctionAppState {
    Stopped = 'Stopped',
    Running = 'Running'
}

export async function waitForFunctionAppState(webSiteManagementClient: WebSiteManagementClient, resourceGroup: string, name: string, state: FunctionAppState, intervalMs: number = 5000, timeoutMs: number = 60000): Promise<void> {
    let count: number = 0;
    while (count < timeoutMs) {
        count += intervalMs;
        const currentSite: Site = await webSiteManagementClient.webApps.get(resourceGroup, name);
        if (currentSite.state && currentSite.state === state) {
            return;
        }
        await new Promise((r: () => void): NodeJS.Timer => setTimeout(r, intervalMs));
    }
    throw new Error(localize('azFunc.stateTimeoutError', 'Timeout waiting for Function App \'{0}\' state \'{1}\'.', name, state));
}

export class Pick implements QuickPickItem {
    public readonly description: string;
    public readonly label: string;
    constructor(label: string, description?: string) {
        this.label = label;
        this.description = description ? description : '';
    }
}

export class PickWithData<T> extends Pick {
    public readonly data: T;
    constructor(data: T, label: string, description?: string) {
        super(label, description);
        this.data = data;
    }
}

export async function writeToFile(path: string, data: string): Promise<void> {
    await new Promise((resolve: () => void, reject: (e: Error) => void): void => {
        fs.writeFile(path, data, (error?: Error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}
