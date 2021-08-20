/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { funcPackageName, PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { nonNullValue } from '../utils/nonNull';
import { tryGetInstalledBrewPackageName } from './getBrewPackageName';
import { validateNoFuncCliSetting } from './getFuncCliPath';
import { getFuncPackageManagers } from './getFuncPackageManagers';
import { tryGetLocalFuncVersion } from './tryGetLocalFuncVersion';

export async function uninstallFuncCoreTools(context: IActionContext, packageManagers?: PackageManager[]): Promise<void> {
    validateNoFuncCliSetting();

    ext.outputChannel.show();
    packageManagers = packageManagers || await getFuncPackageManagers(true /* isFuncInstalled */);
    let packageManager: PackageManager;
    if (packageManagers.length === 0) {
        throw new Error(localize('notInstalled', 'Cannot uninstall Azure Functions Core Tools because it is not installed with brew or npm.'));
    } else if (packageManagers.length === 1) {
        packageManager = packageManagers[0];
    } else {
        const placeHolder: string = localize('multipleInstalls', 'Multiple installs of the func cli detected. Select the one to uninstall');
        const picks: IAzureQuickPickItem<PackageManager>[] = packageManagers.map(pm => { return { label: localize('uninstall', 'Uninstall {0} package', pm), data: pm }; });
        packageManager = (await context.ui.showQuickPick(picks, { placeHolder, stepName: 'multipleFuncInstalls' })).data;
    }

    switch (packageManager) {
        case PackageManager.npm:
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'uninstall', '-g', funcPackageName);
            break;
        case PackageManager.brew:
            const version: FuncVersion = nonNullValue(await tryGetLocalFuncVersion(context, undefined), 'localFuncVersion');
            const brewPackageName: string = nonNullValue(await tryGetInstalledBrewPackageName(version), 'brewPackageName');
            await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'uninstall', brewPackageName);
            break;
        default:
            throw new RangeError(localize('invalidPackageManager', 'Invalid package manager "{0}".', packageManagers[0]));
    }
}
