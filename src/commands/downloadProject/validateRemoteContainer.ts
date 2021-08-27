/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';


export async function validateRemoteContainer(): Promise<boolean> {
    let installed: boolean = false;
    const extension: vscode.Extension<string> | undefined = vscode.extensions.getExtension("ms-vscode-remote.remote-containers");
    if (extension) {
        installed = true
    }

    return installed;
}
