/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcPackageName, PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { nonNullValue } from '../utils/nonNull';
import { getBrewPackageName, tryGetInstalledBrewPackageName } from './getBrewPackageName';
import { getNpmDistTag, INpmDistTag } from './getNpmDistTag';

export async function updateFuncCoreTools(packageManager: PackageManager, version: FuncVersion): Promise<void> {
    ext.outputChannel.show();
    switch (packageManager) {
        case PackageManager.npm:
            const distTag: INpmDistTag = await getNpmDistTag(version);
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', `${funcPackageName}@${distTag.tag}`);
            break;
        case PackageManager.brew:
            const brewPackageName: string = getBrewPackageName(version);
            const installedBrewPackageName: string = nonNullValue(await tryGetInstalledBrewPackageName(version), 'brewPackageName');
            if (brewPackageName !== installedBrewPackageName) {
                // Uninstall deprecated tag and install latest tag
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'uninstall', installedBrewPackageName);
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'install', brewPackageName);
            } else {
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'upgrade', brewPackageName);
            }
            break;
        default:
            throw new RangeError(localize('invalidPackageManager', 'Invalid package manager "{0}".', packageManager));
    }
}
