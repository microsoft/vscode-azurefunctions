/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, DialogResponses, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as os from "os";
import { env, type MessageItem } from 'vscode';
import { funcVersionSetting, type PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { tryParseFuncVersion, type FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { openUrl } from '../utils/openUrl';
import { getWorkspaceSetting } from '../vsCodeConfig/settings';
import { generateLinuxErrorMessages, type ILinuxErrorMessages } from './generateLinuxErrorMessages';
import { getFuncCliPath, hasFuncCliSetting } from './getFuncCliPath';
import { getFuncPackageManagers } from './getFuncPackageManagers';
import { installFuncCoreTools, lastCoreToolsInstallCommand } from './installFuncCoreTools';

export async function validateFuncCoreToolsInstalled(context: IActionContext, message: string, projectPath?: string): Promise<boolean> {
    let input: MessageItem | undefined;
    let installed: boolean = false;
    let failedInstall: string = localize('failedInstallFuncTools', 'Core Tools installation has failed and will have to be installed manually.');
    const install: MessageItem = { title: localize('install', 'Install') };

    if (hasFuncCliSetting()) {
        // Defer to the func cli path setting instead of checking here
        // For example, if the path is set to something like "node_modules/.bin/func", that may not exist until _after_ we run this check when the "npm install" task is run
        context.telemetry.properties.funcCliSource = 'setting';
        return true;
    }

    await callWithTelemetryAndErrorHandling('azureFunctions.validateFuncCoreToolsInstalled', async (innerContext: IActionContext) => {
        innerContext.errorHandling.suppressDisplay = true;

        if (!getWorkspaceSetting<boolean>('validateFuncCoreTools', projectPath)) {
            innerContext.telemetry.properties.validateFuncCoreTools = 'false';
            installed = true;
        } else if (await funcToolsInstalled(innerContext, projectPath)) {
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
                const linuxErrorMessages: ILinuxErrorMessages = await generateLinuxErrorMessages(!!packageManagers.length /* hasPackageManager */);
                if (linuxErrorMessages.noPackageManager) {
                    message += ' ' + linuxErrorMessages.noPackageManager;
                }
                if (linuxErrorMessages.failedInstall) {
                    failedInstall += ' ' + linuxErrorMessages.failedInstall;
                }
            }

            // See issue: https://github.com/Microsoft/vscode-azurefunctions/issues/535
            input = await innerContext.ui.showWarningMessage(message, { modal: true }, ...items);
            innerContext.telemetry.properties.dialogResult = input.title;

            if (input === install) {
                const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, projectPath));
                await installFuncCoreTools(innerContext, packageManagers, version);
                installed = true;
            } else if (input === DialogResponses.learnMore) {
                await openUrl(getInstallUrl());
            }
        }
    });

    // validate that Func Tools was installed only if user confirmed
    if (input === install && !installed) {
        const buttons: MessageItem[] = [];
        const copyCommand: MessageItem = { title: localize('copyCommand', 'Copy command') };
        if (os.platform() === 'linux' && lastCoreToolsInstallCommand.length) {
            buttons.push(copyCommand);
        }

        buttons.push(DialogResponses.learnMore);
        const result = await context.ui.showWarningMessage(failedInstall, ...buttons);

        if (result === DialogResponses.learnMore) {
            await openUrl(getInstallUrl());
        } else if (result === copyCommand) {
            const lastInstallCommand: string = lastCoreToolsInstallCommand.join(' ');
            await env.clipboard.writeText(lastInstallCommand);
            ext.outputChannel.appendLog(localize('copiedClipboard', 'Copied to clipboard: "{0}"', lastInstallCommand));
        }
    }

    return installed;
}

export async function funcToolsInstalled(context: IActionContext, projectPath: string | undefined): Promise<boolean> {
    try {
        const funcCliPath = await getFuncCliPath(context, projectPath);
        await cpUtils.executeCommand(undefined, projectPath, funcCliPath, '--version');
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
