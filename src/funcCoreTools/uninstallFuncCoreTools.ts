/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { funcToolsInstalled } from '../commands/createNewProject/validateFuncCoreToolsInstalled';
import { funcPackageName, PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { getFuncPackageManager } from './getFuncPackageManager';

export async function uninstallFuncCoreTools(): Promise<void> {
    ext.outputChannel.show();
    if (await funcToolsInstalled()) {
        switch (await getFuncPackageManager(true /* isFuncInstalled */)) {
            case PackageManager.npm:
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'uninstall', '-g', funcPackageName);
                break;
            case PackageManager.brew:
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'uninstall', funcPackageName);
                break;
            default:
                throw new Error(localize('cannotUninstall', 'Uninstall is only supported for brew or npm.'));
                break;
        }
    } else {
        throw new Error(localize('notInstalled', 'Cannot uninstall Azure Functions Core Tools because it is not installed.'));
    }
}
