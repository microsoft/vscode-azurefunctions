/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName, isWindows, PackageManager, ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { promptForProjectRuntime } from "../ProjectSettings";
import { cpUtils } from '../utils/cpUtils';

export async function installFuncCoreTools(packageManager: PackageManager): Promise<void> {
    let runtime: ProjectRuntime;
    if (!isWindows) {
        runtime = ProjectRuntime.v2;
    } else {
        runtime = await promptForProjectRuntime(localize('windowsVersion', 'Select the version of the runtime to install'));
    }

    ext.outputChannel.show();
    switch (packageManager) {
        case PackageManager.npm:
            switch (runtime) {
                case ProjectRuntime.v1:
                    await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', funcPackageName);
                    break;
                case ProjectRuntime.v2:
                    await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', `${funcPackageName}@core`, '--unsafe-perm', 'true');
                    break;
                default:
                    throw new RangeError(localize('invalidRuntime', 'Invalid runtime "{0}".', runtime));
            }
            break;
        case PackageManager.brew:
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'tap', 'azure/functions');
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'install', funcPackageName);
            break;
        default:
            throw new RangeError(localize('invalidPackageManager', 'Invalid package manager "{0}".', packageManager));
            break;
    }
}
