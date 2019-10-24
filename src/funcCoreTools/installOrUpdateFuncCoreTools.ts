/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureQuickPickItem } from 'vscode-azureextensionui';
import { PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { FuncVersion, promptForFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { getFuncPackageManagers } from './getFuncPackageManagers';
import { installFuncCoreTools } from './installFuncCoreTools';
import { tryGetLocalFuncVersion } from './tryGetLocalFuncVersion';
import { updateFuncCoreTools } from './updateFuncCoreTools';
import { funcToolsInstalled } from './validateFuncCoreToolsInstalled';

export async function installOrUpdateFuncCoreTools(): Promise<void> {
    const isFuncInstalled: boolean = await funcToolsInstalled();
    const packageManagers: PackageManager[] = await getFuncPackageManagers(isFuncInstalled);
    if (packageManagers.length === 0) {
        throw new Error(localize('installNotSupported', 'Install or update is only supported for brew or npm.'));
    }

    if (isFuncInstalled) {
        let packageManager: PackageManager;
        if (packageManagers.length === 1) {
            packageManager = packageManagers[0];
        } else {
            const placeHolder: string = localize('multipleInstalls', 'Multiple installs of the func cli detected. Select the one to update');
            const picks: IAzureQuickPickItem<PackageManager>[] = packageManagers.map(pm => { return { label: localize('update', 'Update {0} package', pm), data: pm }; });
            packageManager = (await ext.ui.showQuickPick(picks, { placeHolder })).data;
        }

        let version: FuncVersion | undefined = await tryGetLocalFuncVersion();
        if (version === undefined) {
            version = await promptForFuncVersion(localize('selectLocalVersion', 'Failed to detect local version automatically. Select your version to update'));
        }
        await updateFuncCoreTools(packageManager, version);
    } else {
        await installFuncCoreTools(packageManagers);
    }
}
