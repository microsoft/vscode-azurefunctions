/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as vscode from 'vscode';

import { reporter } from './telemetry';
import WebSiteManagementClient = require('azure-arm-website');

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

export async function showInputBox(placeHolder: string, prompt: string, validateInput?: (s: string) => string | undefined | null): Promise<string> {
    const options: vscode.InputBoxOptions = {
        placeHolder: placeHolder,
        prompt: prompt,
        validateInput: validateInput,
        ignoreFocusOut: true
    }
    const result = await vscode.window.showInputBox(options);

    if (!result) {
        throw new UserCancelledError();
    }

    return result;
}

export enum FunctionAppState {
    Stopped = "stopped",
    Running = "running"
};

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

export class QuickPickItemWithData<T> implements vscode.QuickPickItem {
    readonly description: string;
    constructor(readonly label: string, description?: string, readonly data?: T) {
        this.description = description ? description : '';
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
    message = "You must have a workspace open to perform this operation."
}