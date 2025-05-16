/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as semver from 'semver';
import { getMajorVersion, type FuncVersion } from '../../../FuncVersion';
import { ext } from '../../../extensionVariables';
import { getLocalFuncCoreToolsVersion } from '../../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from "../../../localize";
import { cpUtils } from "../../../utils/cpUtils";

export async function getPythonVersion(pyAlias: string): Promise<string> {
    const result: cpUtils.ICommandResult = await cpUtils.tryExecuteCommand(undefined /*don't display output*/, undefined /*default to cwd*/, `${pyAlias} --version`);
    if (result.code !== 0) {
        throw new Error(localize('failValidate', 'Failed to validate version: {0}', result.cmdOutputIncludingStderr));
    }

    const matches: RegExpMatchArray | null = result.cmdOutputIncludingStderr.match(/^Python (\S*)/i);
    if (matches === null || !matches[1]) {
        throw new Error(localize('failedParse', 'Failed to parse version: {0}', result.cmdOutputIncludingStderr));
    } else {
        return matches[1];
    }
}

export async function getSupportedPythonVersions(context: IActionContext, funcVersionFromSetting: FuncVersion): Promise<string[]> {
    // Cache the task so we're not waiting on this every time
    const localVersionTask: Promise<string | null> = getLocalFuncCoreToolsVersion(context, undefined);

    const result: string[] = [];

    const versionInfo: [string, string][] = [
        ['2.7.1846', '3.7'],
        ['3.0.2245', '3.8'],
        ['3.0.3216', '3.9'],
        ['4.0.4915', '3.10'],
        ['4.0.5348', '3.11'],
        // not sure if this is the minimum version, but I confirmed that 4.0.7030 works with Python 3.12
        ['4.0.7030', '3.12'],
    ];

    for (const [minFuncVersion, pyVersion] of versionInfo) {
        function showVersionWarning(currentVersion: string): void {
            ext.outputChannel.appendLine(localize('outOfDateWarning', 'WARNING: Python version {0}+ is not supported with version "{1}" of the func CLI. Update to at least "{2}" for support.', pyVersion, currentVersion, minFuncVersion));
        }

        try {
            // Prioritize checking against VS Code setting first which is faster than `getLocalFuncCoreToolsVersion`
            if (semver.satisfies(minFuncVersion, getMajorVersion(funcVersionFromSetting))) {
                const currentVersion: string | null = await localVersionTask;
                if (currentVersion && semver.lt(currentVersion, minFuncVersion)) {
                    showVersionWarning(currentVersion);
                    return result;
                }
            } else if (semver.gtr(minFuncVersion, getMajorVersion(funcVersionFromSetting))) {
                showVersionWarning(funcVersionFromSetting);
                return result;
            }
        } catch {
            // ignore
        }

        result.push(pyVersion);
    }

    return result;
}

export function isSupportedPythonVersion(supportedVersions: string[], version: string): boolean {
    try {
        return !!supportedVersions.some(v => semver.satisfies(version, v));
    } catch {
        // If the version is not valid semver, assume it's not supported
        return false;
    }
}
