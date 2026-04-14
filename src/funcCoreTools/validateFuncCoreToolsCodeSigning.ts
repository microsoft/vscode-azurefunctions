/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export async function validateFuncCoreToolsCodeSigning(funcCoreToolsPath: string): Promise<boolean | undefined> {
    switch (process.platform) {
        case 'darwin':
            // needs implementation
            // - macOS: codesign - v < path >
            return true;
        case 'win32':
            // needs implementation
            // - Windows: PowerShell Get - AuthenticodeSignature<path>
            return true;
        default:
            // not supported
            return undefined;
    }
}
