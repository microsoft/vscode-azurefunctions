/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { PackageManager } from '../constants';
import { FuncVersion, promptForFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { validateNoFuncCliSetting } from './getFuncCliPath';
import { getFuncPackageManagers } from './getFuncPackageManagers';
import { installFuncCoreTools } from './installFuncCoreTools';
import { tryGetLocalFuncVersion } from './tryGetLocalFuncVersion';
import { updateFuncCoreTools } from './updateFuncCoreTools';
import { funcToolsInstalled, getInstallUrl } from './validateFuncCoreToolsInstalled';

export async function installOrUpdateFuncCoreTools(context: IActionContext): Promise<void> {
    validateNoFuncCliSetting();

    const isFuncInstalled: boolean = await funcToolsInstalled(context, undefined);
    const packageManagers: PackageManager[] = await getFuncPackageManagers(isFuncInstalled);
    if (packageManagers.length === 0) {
        context.errorHandling.suppressReportIssue = true;
        throw new Error(localize('installNotSupported', 'Failed to install or update. Follow [these instructions]({0}) to install manually.', getInstallUrl()));
    }

    if (isFuncInstalled) {
        let packageManager: PackageManager;
        if (packageManagers.length === 1) {
            packageManager = packageManagers[0];
        } else {
            const placeHolder: string = localize('multipleInstalls', 'Multiple installs of the func cli detected. Select the one to update');
            const picks: IAzureQuickPickItem<PackageManager>[] = packageManagers.map(pm => { return { label: localize('update', 'Update {0} package', pm), data: pm }; });
            packageManager = (await context.ui.showQuickPick(picks, { placeHolder, stepName: 'multipleFuncInstalls' })).data;
        }

        let version: FuncVersion | undefined = await tryGetLocalFuncVersion(context, undefined);
        if (version === undefined) {
            version = await promptForFuncVersion(context, localize('selectLocalVersion', 'Failed to detect local version automatically. Select your version to update'));
        }
        await updateFuncCoreTools(context, packageManager, version);
    } else {
        await installFuncCoreTools(context, packageManagers);
    }
}
