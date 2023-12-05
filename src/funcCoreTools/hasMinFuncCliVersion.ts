
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as semver from 'semver';
import { getMajorVersion, type FuncVersion } from "../FuncVersion";
import { getLocalFuncCoreToolsVersion } from './getLocalFuncCoreToolsVersion';

export async function hasMinFuncCliVersion(context: IActionContext, minVersion: string, projectVersion: FuncVersion): Promise<boolean> {
    const majorVersion: string = getMajorVersion(projectVersion);
    if (semver.gtr(minVersion, majorVersion)) {
        return false;
    } else if (semver.ltr(minVersion, majorVersion)) {
        return true;
    } else {
        try {
            const localCliVersion: string | null = await getLocalFuncCoreToolsVersion(context, undefined);
            if (localCliVersion) {
                return semver.gte(localCliVersion, minVersion);
            }
        } catch {
            // use default
        }
        return true;
    }
}
