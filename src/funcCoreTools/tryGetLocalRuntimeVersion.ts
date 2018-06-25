/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import { isWindows, ProjectRuntime } from '../constants';
import { getLocalFuncCoreToolsVersion } from './getLocalFuncCoreToolsVersion';

export async function tryGetLocalRuntimeVersion(): Promise<ProjectRuntime | undefined> {
    if (!isWindows) {
        return ProjectRuntime.beta;
    } else {
        try {
            const version: string | null = await getLocalFuncCoreToolsVersion();
            if (version !== null) {
                return getProjectRuntimeFromVersion(version);
            }
        } catch (err) {
            // swallow errors and return undefined
        }

        return undefined;
    }
}

export function getProjectRuntimeFromVersion(version: string): ProjectRuntime | undefined {
    switch (semver.major(version)) {
        case 1:
            return ProjectRuntime.one;
        case 2:
            return ProjectRuntime.beta;
        default:
            return undefined;
    }
}
