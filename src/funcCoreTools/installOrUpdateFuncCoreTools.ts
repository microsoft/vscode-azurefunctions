/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureQuickPickItem } from 'vscode-azureextensionui';
import { PackageManager, ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { promptForProjectRuntime } from '../ProjectSettings';
import { getFuncPackageManagers } from './getFuncPackageManagers';
import { installFuncCoreTools } from './installFuncCoreTools';
import { tryGetLocalRuntimeVersion } from './tryGetLocalRuntimeVersion';
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
            const picks: IAzureQuickPickItem<PackageManager>[] = packageManagers.map(pm => { return { label: pm, data: pm }; });
            packageManager = (await ext.ui.showQuickPick(picks, { placeHolder })).data;
        }

        let projectRuntime: ProjectRuntime | undefined = await tryGetLocalRuntimeVersion();
        // tslint:disable-next-line:strict-boolean-expressions
        if (!projectRuntime) {
            projectRuntime = await promptForProjectRuntime(localize('selectLocalRuntime', 'Failed to detect local runtime automatically. Select your runtime to update'));
        }
        await updateFuncCoreTools(packageManager, projectRuntime);
    } else {
        await installFuncCoreTools(packageManagers);
    }
}
