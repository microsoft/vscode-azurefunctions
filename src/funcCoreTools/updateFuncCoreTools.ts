/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName, PackageManager, ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { getNpmDistTag, INpmDistTag } from './getNpmDistTag';

export async function updateFuncCoreTools(packageManager: PackageManager, projectRuntime: ProjectRuntime): Promise<void> {
    ext.outputChannel.show();
    switch (packageManager) {
        case PackageManager.npm:
            const distTag: INpmDistTag = await getNpmDistTag(projectRuntime);
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', `${funcPackageName}@${distTag.tag}`);
            break;
        case PackageManager.brew:
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'upgrade', funcPackageName);
            break;
        default:
            throw new RangeError(localize('invalidPackageManager', 'Invalid package manager "{0}".', packageManager));
            break;
    }
}
