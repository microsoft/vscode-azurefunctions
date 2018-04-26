/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as opn from 'opn';
import { MessageItem } from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { Platform } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { getFuncExtensionSetting, updateGlobalSetting } from '../../ProjectSettings';
import { cpUtils } from '../../utils/cpUtils';

export async function validateFuncCoreToolsInstalled(): Promise<void> {
    let input: MessageItem | undefined;
    await callWithTelemetryAndErrorHandling('azureFunctions.validateFuncCoreToolsInstalled', ext.reporter, undefined, async function (this: IActionContext): Promise<void> {
        this.suppressErrorDisplay = true;
        const settingKey: string = 'showFuncInstallation';
        if (getFuncExtensionSetting<boolean>(settingKey)) {
            if (!(await funcToolsInstalled()) && (await brewOrNpmInstalled()) && process.platform !== Platform.Linux) {
                // https://github.com/Microsoft/vscode-azurefunctions/issues/311
                input = await ext.ui.showWarningMessage(localize('installFuncTools', 'You need Azure Functions Core Tools to locally debug your functions.  Run {0} now?', getCommandForPlatform()), DialogResponses.yes, DialogResponses.dontWarnAgain, DialogResponses.skipForNow);
                if (input === DialogResponses.yes) {
                    await attemptToInstallLatestFunctionRuntime();
                } else if (input === DialogResponses.dontWarnAgain) {
                    await updateGlobalSetting(settingKey, false);
                }
            }
        }
    });
    // validate that Func Tools was installed only if user confirmed
    if (input === DialogResponses.yes && !(await funcToolsInstalled())) {
        if (await ext.ui.showWarningMessage(localize('failedInstallFuncTools', 'The Azure Functions Core Tools installion has failed and will have to be installed manually.'), DialogResponses.learnMore) === DialogResponses.learnMore) {
            // tslint:disable-next-line:no-unsafe-any
            opn('https://aka.ms/Dqur4e');
        }

    }
}

export async function attemptToInstallLatestFunctionRuntime(runtimeVersion?: string): Promise<void> {
    switch (process.platform) {
        case Platform.Windows:
            let winput: string;
            const v1: string = 'v1';
            const v2: string = 'v2';
            if (!runtimeVersion) {
                const v1MsgItm: MessageItem = { title: v1 };
                const v2MsgItm: MessageItem = { title: v2 };
                winput = (await ext.ui.showWarningMessage(localize('windowsVersion', 'Which version of the runtime do you want to install?'), v1MsgItm, v2MsgItm)).title;
            } else {
                winput = runtimeVersion;
            }

            if (winput === v1) {
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools');
            } else if (winput === v2) {
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools@core', '--unsafe-perm', 'true');
            }
            break;
        case Platform.MacOS:
            try {
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'tap', 'azure/functions');
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'brew', 'install', 'azure-functions-core-tools');
            } catch (error) {
                // if brew fails for whatever reason, fall back to npm
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools@core', '--unsafe-perm', 'true');
            }
            break;
        default:
            break;
    }
}

function getCommandForPlatform(): string {
    switch (process.platform) {
        case Platform.MacOS:
            return '`brew tap azure/functions && brew install azure-functions-core-tools`';
        default:
            return '`npm install -g azure-functions-core-tools@core`';
    }
}

async function funcToolsInstalled(): Promise<boolean> {
    try {
        await cpUtils.executeCommand(undefined, undefined, 'func');
        return true;
    } catch (error) {
        return false;
    }
}

export async function brewOrNpmInstalled(): Promise<boolean> {
    switch (process.platform) {
        case Platform.MacOS:
            try {
                await cpUtils.executeCommand(undefined, undefined, 'brew', '--version');
                return true;
            } catch (error) {
                // an error indicates no brew; continue to default, npm case
            }
        default:
            try {
                await cpUtils.executeCommand(undefined, undefined, 'npm', '--version');
                return true;
            } catch (error) {
                return false;
            }
    }
}
