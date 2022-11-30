/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext } from '@microsoft/vscode-azext-utils';
import * as os from "os";
import { MessageItem } from 'vscode';
import { funcVersionSetting, PackageManager } from '../constants';
import { FuncVersion, tryParseFuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { openUrl } from '../utils/openUrl';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { getFuncCliPath, hasFuncCliSetting } from './getFuncCliPath';
import { getFuncPackageManagers } from './getFuncPackageManagers';
import { getLinuxDistroTag, LinuxDistroTag } from './getLinuxDistroTag';
import { installFuncCoreTools } from './installFuncCoreTools';

export async function validateFuncCoreToolsInstalled(context: IActionContext, message: string, workspacePath: string): Promise<boolean> {
    let input: MessageItem | undefined;
    let installed: boolean = false;
    const install: MessageItem = { title: localize('install', 'Install') };

    if (hasFuncCliSetting()) {
        // Defer to the func cli path setting instead of checking here
        // For example, if the path is set to something like "node_modules/.bin/func", that may not exist until _after_ we run this check when the "npm install" task is run
        context.telemetry.properties.funcCliSource = 'setting';
        return true;
    }

    await callWithTelemetryAndErrorHandling('azureFunctions.validateFuncCoreToolsInstalled', async (innerContext: IActionContext) => {
        innerContext.errorHandling.suppressDisplay = true;

        if (!getWorkspaceSetting<boolean>('validateFuncCoreTools', workspacePath)) {
            innerContext.telemetry.properties.validateFuncCoreTools = 'false';
            installed = true;
        } else if (await funcToolsInstalled(innerContext, workspacePath)) {
            installed = true;
        } else {
            const items: MessageItem[] = [];
            const packageManagers: PackageManager[] = await getFuncPackageManagers(false /* isFuncInstalled */);
            if (packageManagers.length > 0) {
                items.push(install);
            } else {
                items.push(DialogResponses.learnMore);
            }

            if (os.platform() === 'linux') {
                const linuxDistroTag: LinuxDistroTag | undefined = await getLinuxDistroTag();
                if (linuxDistroTag) {
                    message += ' ';
                    if (linuxDistroTag['PRETTY_NAME']) {
                        message += localize('linuxDistributionInfoPretty', 'We detected that you are currently running "{0}".', linuxDistroTag['PRETTY_NAME'])
                    } else if (linuxDistroTag['NAME'] && linuxDistroTag['VERSION']) {
                        message += localize('linuxDistributionInfo', 'We detected that you are currently running "{0} {1}".', linuxDistroTag['NAME'], linuxDistroTag['VERSION']);
                    }
                }
            }

            // See issue: https://github.com/Microsoft/vscode-azurefunctions/issues/535
            input = await innerContext.ui.showWarningMessage(message, { modal: true }, ...items);
            innerContext.telemetry.properties.dialogResult = input.title;

            if (input === install) {
                const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, workspacePath));
                await installFuncCoreTools(innerContext, packageManagers, version);
                installed = true;
            } else if (input === DialogResponses.learnMore) {
                await openUrl(getInstallUrl());
            }
        }
    });

    // validate that Func Tools was installed only if user confirmed
    if (input === install && !installed) {
        if (await context.ui.showWarningMessage(localize('failedInstallFuncTools', 'The Azure Functions Core Tools installation has failed and will have to be installed manually.'), DialogResponses.learnMore) === DialogResponses.learnMore) {
            await openUrl(getInstallUrl());
        }
    }

    return installed;
}

export async function funcToolsInstalled(context: IActionContext, workspacePath: string | undefined): Promise<boolean> {
    try {
        const funcCliPath = await getFuncCliPath(context, workspacePath);
        await cpUtils.executeCommand(undefined, workspacePath, funcCliPath, '--version');
        return true;
    } catch (error) {
        return false;
    }
}

export function getInstallUrl(): string {
    switch (process.platform) {
        case 'linux':
            return 'https://aka.ms/AAb9zn8';
        case 'darwin':
            return 'https://aka.ms/AAb9zn6';
        default:
            return 'https://aka.ms/Dqur4e';

    }
}
