/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Returns a node module installed with VSCode, or undefined if it fails.
 */
export function getCoreNodeModule<T>(moduleName: string): T | undefined {
    try {
         
        return require(`${vscode.env.appRoot}/node_modules.asar/${moduleName}`);
    } catch (_err) {
        // ignore
    }

    try {
         
        return require(`${vscode.env.appRoot}/node_modules/${moduleName}`);
    } catch (_err) {
        // ignore
    }
    return undefined;
}
