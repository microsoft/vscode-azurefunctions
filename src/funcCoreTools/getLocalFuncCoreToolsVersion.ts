/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import { cpUtils } from '../utils/cpUtils';

export async function getLocalFuncCoreToolsVersion(): Promise<string | null> {
    // https://github.com/Microsoft/vscode-azurefunctions/issues/343
    const versionInfo: string = await cpUtils.executeCommand(undefined, undefined, 'func');
    const matchResult: RegExpMatchArray | null = versionInfo.match(/(?:.*)Azure Functions Core Tools (.*)/);
    if (matchResult !== null) {
        let localVersion: string = matchResult[1].replace(/[()]/g, '').trim(); // remove () and whitespace
        // this is a fix for a bug currently in the Function CLI
        if (localVersion === '220.0.0-beta.0') {
            localVersion = '2.0.1-beta.25';
        }
        return semver.valid(localVersion);
    }
    return null;
}
