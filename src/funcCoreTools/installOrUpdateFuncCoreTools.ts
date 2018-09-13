/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PackageManager, ProjectRuntime } from '../constants';
import { localize } from '../localize';
import { promptForProjectRuntime } from '../ProjectSettings';
import { getFuncPackageManager } from './getFuncPackageManager';
import { installFuncCoreTools } from './installFuncCoreTools';
import { tryGetLocalRuntimeVersion } from './tryGetLocalRuntimeVersion';
import { updateFuncCoreTools } from './updateFuncCoreTools';
import { funcToolsInstalled } from './validateFuncCoreToolsInstalled';

export async function installOrUpdateFuncCoreTools(): Promise<void> {
    const isFuncInstalled: boolean = await funcToolsInstalled();
    const packageManager: PackageManager | undefined = await getFuncPackageManager(isFuncInstalled);
    // tslint:disable-next-line:strict-boolean-expressions
    if (!packageManager) {
        throw new Error(localize('installNotSupported', 'Install or update is only supported for brew or npm.'));
    }

    if (isFuncInstalled) {
        let projectRuntime: ProjectRuntime | undefined = await tryGetLocalRuntimeVersion();
        // tslint:disable-next-line:strict-boolean-expressions
        if (!projectRuntime) {
            projectRuntime = await promptForProjectRuntime(localize('selectLocalRuntime', 'Failed to detect local runtime automatically. Select your runtime to update'));
        }
        await updateFuncCoreTools(packageManager, projectRuntime);
    } else {
        await installFuncCoreTools(packageManager);
    }
}
