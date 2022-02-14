/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import { FuncVersion, tryParseFuncVersion } from '../FuncVersion';
import { getLocalFuncCoreToolsVersion } from './getLocalFuncCoreToolsVersion';

export async function tryGetLocalFuncVersion(context: IActionContext, workspacePath: string | undefined): Promise<FuncVersion | undefined> {
    try {
        const version: string | null = await getLocalFuncCoreToolsVersion(context, workspacePath);
        if (version) {
            return tryParseFuncVersion(version);
        }
    } catch (err) {
        // swallow errors and return undefined
    }

    return undefined;
}
