/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
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

export async function getSupportedPythonVersions(): Promise<string[]> {
    const versions: string[] = ['3.6'];

    const minFuncVersion: string = '2.7.1846';
    try {
        const currentVersion: string | null = await getLocalFuncCoreToolsVersion();
        if (currentVersion && semver.lt(currentVersion, minFuncVersion)) {
            ext.outputChannel.appendLine(localize('outOfDateWarning', 'WARNING: Some Python versions are not supported with version "{0}" of the func CLI. Update to at least "{1}".', currentVersion, minFuncVersion));
            return versions;
        }
    } catch {
        // ignore
    }

    versions.push('3.7');
    return versions;
}

export function isSupportedPythonVersion(supportedVersions: string[], version: string): boolean {
    try {
        return !!supportedVersions.some(v => semver.satisfies(version, v));
    } catch {
        // If the version is not valid semver, assume it's not supported
        return false;
    }
}
