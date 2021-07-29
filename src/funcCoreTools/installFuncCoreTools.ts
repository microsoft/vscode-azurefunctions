/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from 'vscode-azureextensionui';
import { funcPackageName, PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { FuncVersion, promptForFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { getBrewPackageName } from './getBrewPackageName';
import { getNpmDistTag, INpmDistTag } from './getNpmDistTag';

export async function installFuncCoreTools(context: IActionContext, packageManagers: PackageManager[], version?: FuncVersion): Promise<void> {
    version = version || await promptForFuncVersion(context, localize('selectVersion', 'Select the version of the runtime to install'));

    ext.outputChannel.show();
    // Use the first package manager
    switch (packageManagers[0]) {
        case PackageManager.npm:
            const distTag: INpmDistTag = await getNpmDistTag(context, version);
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', `${funcPackageName}@${distTag.tag}`);
            break;
        case PackageManager.brew:
            const brewPackageName: string = getBrewPackageName(version);
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'tap', 'azure/functions');
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'install', brewPackageName);
            break;
        default:
            throw new RangeError(localize('invalidPackageManager', 'Invalid package manager "{0}".', packageManagers[0]));
    }
}
