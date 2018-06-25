/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageItem } from 'vscode';
import { funcPackageName, PackageManager, Platform } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';

export async function installFuncCoreTools(packageManager: PackageManager, runtimeVersion?: string): Promise<void> {
    const v1: string = 'v1';
    const v2: string = 'v2';
    if (process.platform !== Platform.Windows) {
        runtimeVersion = v2;
    } else if (!runtimeVersion) {
        const v1MsgItm: MessageItem = { title: v1 };
        const v2MsgItm: MessageItem = { title: v2 };
        runtimeVersion = (await ext.ui.showWarningMessage(localize('windowsVersion', 'Which version of the runtime do you want to install?'), v1MsgItm, v2MsgItm)).title;
    }

    ext.outputChannel.show();
    switch (packageManager) {
        case PackageManager.npm:
            switch (runtimeVersion) {
                case v1:
                    await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', funcPackageName);
                    break;
                case v2:
                    await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', `${funcPackageName}@core`, '--unsafe-perm', 'true');
                    break;
                default:
                    throw new RangeError(localize('invalidRuntime', 'Invalid runtime "{0}".', runtimeVersion));
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
