/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows, ProjectRuntime } from '../constants';
import { convertStringToRuntime } from '../ProjectSettings';
import { getLocalFuncCoreToolsVersion } from './getLocalFuncCoreToolsVersion';

export async function tryGetLocalRuntimeVersion(): Promise<ProjectRuntime | undefined> {
    if (!isWindows) {
        return ProjectRuntime.v2;
    } else {
        try {
            const version: string | null = await getLocalFuncCoreToolsVersion();
            if (version) {
                return convertStringToRuntime(version);
            }
        } catch (err) {
            // swallow errors and return undefined
        }

        return undefined;
    }
}
