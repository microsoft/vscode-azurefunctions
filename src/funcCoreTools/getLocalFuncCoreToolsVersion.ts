/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { cpUtils } from '../utils/cpUtils';

export async function getLocalFuncCoreToolsVersion(): Promise<string | null> {
    const output: string = await cpUtils.executeCommand(undefined, undefined, ext.funcCliPath, '--version');
    const version: string | null = semver.clean(output);
    if (version) {
        return version;
    } else {
        // Old versions of the func cli do not support '--version', so we have to parse the command usage to get the version
        const matchResult: RegExpMatchArray | null = output.match(/(?:.*)Azure Functions Core Tools (.*)/);
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
}

export function addLocalFuncTelemetry(actionContext: IActionContext): void {
    actionContext.properties.funcCliVersion = 'unknown';

    // tslint:disable-next-line:no-floating-promises
    getLocalFuncCoreToolsVersion().then((version: string) => {
        // tslint:disable-next-line:strict-boolean-expressions
        actionContext.properties.funcCliVersion = version || 'none';
    }).catch(() => {
        actionContext.properties.funcCliVersion = 'none';
    });
}
