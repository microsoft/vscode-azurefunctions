/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { funcPackageName, PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { promptForFuncVersion, type FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { getBrewPackageName } from './getBrewPackageName';
import { getNpmDistTag, type INpmDistTag } from './getNpmDistTag';

export let lastCoreToolsInstallCommand: string[] = [];

export async function installFuncCoreTools(context: IActionContext, packageManagers: PackageManager[], version?: FuncVersion): Promise<void> {
    version = version || await promptForFuncVersion(context, localize('selectVersion', 'Select the version of the runtime to install'));

    ext.outputChannel.show();
    // Use the first package manager
    switch (packageManagers[0]) {
        case PackageManager.npm:
            const distTag: INpmDistTag = await getNpmDistTag(context, version);
            lastCoreToolsInstallCommand = ['npm', 'install', '-g', `${funcPackageName}@${distTag.tag}`];
            await cpUtils.executeCommand(ext.outputChannel, undefined, lastCoreToolsInstallCommand[0], ...lastCoreToolsInstallCommand.slice(1));
            break;
        case PackageManager.brew:
            const brewPackageName: string = getBrewPackageName(version);
            lastCoreToolsInstallCommand = ['brew', 'tap', 'azure/functions'];
            await cpUtils.executeCommand(ext.outputChannel, undefined, lastCoreToolsInstallCommand[0], ...lastCoreToolsInstallCommand.slice(1));
            lastCoreToolsInstallCommand = ['brew', 'install', brewPackageName];
            await cpUtils.executeCommand(ext.outputChannel, undefined, lastCoreToolsInstallCommand[0], ...lastCoreToolsInstallCommand.slice(1));
            break;
        default:
            throw new RangeError(localize('invalidPackageManager', 'Invalid package manager "{0}".', packageManagers[0]));
    }
}
