/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName, PackageManager, ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { cpUtils } from '../utils/cpUtils';

export async function updateFuncCoreTools(packageManager: PackageManager, projectRuntime: ProjectRuntime): Promise<void> {
    ext.outputChannel.show();
    switch (packageManager) {
        case PackageManager.npm:
            if (projectRuntime === ProjectRuntime.one) {
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', funcPackageName);
            } else if (projectRuntime === ProjectRuntime.beta) {
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', `${funcPackageName}@core`, '--unsafe-perm', 'true');
            }
            break;
        case PackageManager.brew:
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'upgrade', funcPackageName);
            break;
        default:
            break;
    }
}
