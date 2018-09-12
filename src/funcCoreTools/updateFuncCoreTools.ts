/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName, PackageManager, ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';

export async function updateFuncCoreTools(packageManager: PackageManager, projectRuntime: ProjectRuntime): Promise<void> {
    ext.outputChannel.show();
    switch (packageManager) {
        case PackageManager.npm:
            switch (projectRuntime) {
                case ProjectRuntime.v1:
                    await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', funcPackageName);
                    break;
                case ProjectRuntime.v2:
                    await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', `${funcPackageName}@core`, '--unsafe-perm', 'true');
                    break;
                default:
                    throw new RangeError(localize('invalidRuntime', 'Invalid runtime "{0}".', projectRuntime));
            }
            break;
        case PackageManager.brew:
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'upgrade', funcPackageName);
            break;
        default:
            throw new RangeError(localize('invalidPackageManager', 'Invalid package manager "{0}".', packageManager));
            break;
    }
}
