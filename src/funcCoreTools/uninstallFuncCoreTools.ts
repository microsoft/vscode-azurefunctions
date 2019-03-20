/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureQuickPickItem } from 'vscode-azureextensionui';
import { funcPackageName, PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { getFuncPackageManagers } from './getFuncPackageManagers';

export async function uninstallFuncCoreTools(packageManagers?: PackageManager[]): Promise<void> {
    ext.outputChannel.show();
    // tslint:disable-next-line: strict-boolean-expressions
    packageManagers = packageManagers || await getFuncPackageManagers(true /* isFuncInstalled */);
    let packageManager: PackageManager;
    if (packageManagers.length === 0) {
        throw new Error(localize('notInstalled', 'Cannot uninstall Azure Functions Core Tools because it is not installed with brew or npm.'));
    } else if (packageManagers.length === 1) {
        packageManager = packageManagers[0];
    } else {
        const placeHolder: string = localize('multipleInstalls', 'Multiple installs of the func cli detected. Select the one to uninstall');
        const picks: IAzureQuickPickItem<PackageManager>[] = packageManagers.map(pm => { return { label: localize('uninstall', 'Uninstall {0} package', pm), data: pm }; });
        packageManager = (await ext.ui.showQuickPick(picks, { placeHolder })).data;
    }

    switch (packageManager) {
        case PackageManager.npm:
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'uninstall', '-g', funcPackageName);
            break;
        case PackageManager.brew:
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'uninstall', funcPackageName);
            break;
        default:
            throw new RangeError(localize('invalidPackageManager', 'Invalid package manager "{0}".', packageManagers[0]));
    }
}
