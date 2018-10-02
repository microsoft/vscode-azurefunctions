/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Used to fetch node modules shipped with VS Code that we don't want to ship with our extension (for example if they are OS-specific)
 */
export async function tryFetchNodeModule<T>(moduleName: string): Promise<T | undefined> {
    try {
        return <T>await import(`${vscode.env.appRoot}/node_modules.asar/${moduleName}`);
    } catch (err) {
        // ignore
    }
    try {
        return <T>await import(`${vscode.env.appRoot}/node_modules/${moduleName}`);
    } catch (err) {
        // ignore
    }
    return undefined;
}
