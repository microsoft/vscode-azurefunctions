/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageItem } from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { funcVersionSetting, PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { FuncVersion, tryParseFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { openUrl } from '../utils/openUrl';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { getFuncPackageManagers } from './getFuncPackageManagers';
import { installFuncCoreTools } from './installFuncCoreTools';

export async function validateFuncCoreToolsInstalled(message: string, fsPath: string): Promise<boolean> {
    let input: MessageItem | undefined;
    let installed: boolean = false;
    const install: MessageItem = { title: localize('install', 'Install') };

    await callWithTelemetryAndErrorHandling('azureFunctions.validateFuncCoreToolsInstalled', async (context: IActionContext) => {
        context.errorHandling.suppressDisplay = true;

        if (!getWorkspaceSetting<boolean>('validateFuncCoreTools', fsPath)) {
            context.telemetry.properties.validateFuncCoreTools = 'false';
            installed = true;
        } else if (await funcToolsInstalled()) {
            installed = true;
        } else {
            const items: MessageItem[] = [];
            const packageManagers: PackageManager[] = await getFuncPackageManagers(false /* isFuncInstalled */);
            if (packageManagers.length > 0) {
                items.push(install);
            } else {
                items.push(DialogResponses.learnMore);
            }

            // See issue: https://github.com/Microsoft/vscode-azurefunctions/issues/535
            input = await context.ui.showWarningMessage(message, { modal: true }, ...items);

            context.telemetry.properties.dialogResult = input.title;

            if (input === install) {
                const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, fsPath));
                await installFuncCoreTools(packageManagers, version);
                installed = true;
            } else if (input === DialogResponses.learnMore) {
                await openUrl('https://aka.ms/Dqur4e');
            }
        }
    });

    // validate that Func Tools was installed only if user confirmed
    if (input === install && !installed) {
        if (await ext.ui.showWarningMessage(localize('failedInstallFuncTools', 'The Azure Functions Core Tools installation has failed and will have to be installed manually.'), DialogResponses.learnMore) === DialogResponses.learnMore) {
            await openUrl('https://aka.ms/Dqur4e');
        }
    }

    return installed;
}

export async function funcToolsInstalled(): Promise<boolean> {
    try {
        await cpUtils.executeCommand(undefined, undefined, ext.funcCliPath, '--version');
        return true;
    } catch (error) {
        return false;
    }
}
