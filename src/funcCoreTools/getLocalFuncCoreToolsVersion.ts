/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as semver from 'semver';
import { cpUtils } from '../utils/cpUtils';
import { getFuncCliPath } from './getFuncCliPath';

export async function getLocalFuncCoreToolsVersion(context: IActionContext, workspacePath: string | undefined): Promise<string | null> {
    const funcCliPath = await getFuncCliPath(context, workspacePath);
    const output: string = await cpUtils.executeCommand(undefined, workspacePath, funcCliPath, '--version');
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

export function addLocalFuncTelemetry(context: IActionContext, workspacePath: string | undefined): void {
    context.telemetry.properties.funcCliVersion = 'unknown';

    getLocalFuncCoreToolsVersion(context, workspacePath).then((version: string) => {
        context.telemetry.properties.funcCliVersion = version || 'none';
    }).catch(() => {
        context.telemetry.properties.funcCliVersion = 'none';
    });
}
