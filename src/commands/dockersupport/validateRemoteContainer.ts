/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cpUtils } from "../../utils/cpUtils";

export async function validateRemoteContainer(): Promise<boolean> {
    let installed: boolean = false;
    try {
        const extensions: string = await cpUtils.executeCommand(undefined, undefined, 'code --list-extensions');
        installed = extensions.includes("ms-vscode-remote.remote-containers");
    } catch (error) {
        installed = false;
    }
    return installed;
}
