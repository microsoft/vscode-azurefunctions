/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extension, extensions } from "vscode";

export async function getApiExport<T>(extensionId: string): Promise<T | undefined> {
    const extension: Extension<T> | undefined = extensions.getExtension(extensionId);
    if (extension) {
        if (!extension.isActive) {
            await extension.activate();
        }

        return extension.exports;
    }

    return undefined;
}
