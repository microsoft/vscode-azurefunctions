/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName, isWindows, PackageManager, ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { promptForProjectRuntime } from "../ProjectSettings";
import { cpUtils } from '../utils/cpUtils';
import { getNpmDistTag, INpmDistTag } from './getNpmDistTag';

export async function installFuncCoreTools(packageManagers: PackageManager[]): Promise<void> {
    let runtime: ProjectRuntime;
    if (!isWindows) {
        runtime = ProjectRuntime.v2;
    } else {
        runtime = await promptForProjectRuntime(localize('windowsVersion', 'Select the version of the runtime to install'));
    }

    ext.outputChannel.show();
    // Use the first package manager
    switch (packageManagers[0]) {
        case PackageManager.npm:
            const distTag: INpmDistTag = await getNpmDistTag(runtime);
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', `${funcPackageName}@${distTag.tag}`);
            break;
        case PackageManager.brew:
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'tap', 'azure/functions');
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'install', funcPackageName);
            break;
        default:
            throw new RangeError(localize('invalidPackageManager', 'Invalid package manager "{0}".', packageManagers[0]));
    }
}
