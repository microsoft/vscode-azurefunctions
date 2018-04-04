/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as opn from 'opn';
import { MessageItem, OutputChannel } from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext, IAzureUserInput } from 'vscode-azureextensionui';
import { Platform } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { getFuncExtensionSetting, updateGlobalSetting } from '../../ProjectSettings';
import { cpUtils } from '../../utils/cpUtils';

export async function validateFuncCoreToolsInstalled(ui: IAzureUserInput, outputChannel: OutputChannel): Promise<void> {
    this.suppressErrorDisplay = true;
    const settingKey: string = 'showFuncInstallation';
    if (getFuncExtensionSetting<boolean>(settingKey)) {
        if (!(await funcCliInstalled()) && (await brewOrNpmInstalled()) && process.platform !== Platform.Linux) {
            // tslint:disable-next-line:no-function-expression
            await callWithTelemetryAndErrorHandling('azureFunctions.validateFuncCoreToolsInstalled', ext.reporter, undefined, async function (this: IActionContext): Promise<void> {
                // https://github.com/Microsoft/vscode-azurefunctions/issues/311
                const input: MessageItem = await ui.showWarningMessage(localize('installFuncCli', 'You need Azure Functions Core Tools CLI to locally debug your functions.  Run {0} now?', getCommandForPlatform()), DialogResponses.yes, DialogResponses.dontWarnAgain, DialogResponses.skipForNow);
                if (input === DialogResponses.yes) {
                    await attemptToInstallLatestFunctionRuntime(ui, outputChannel);
                } else if (input === DialogResponses.dontWarnAgain) {
                    await updateGlobalSetting(settingKey, false);
                }
            });
        }
    }
}

async function attemptToInstallLatestFunctionRuntime(ui: IAzureUserInput, outputChannel: OutputChannel): Promise<void> {
    switch (process.platform) {
        case Platform.Windows:
            const v1: MessageItem = { title: 'v1' };
            const v2: MessageItem = { title: 'v2' };
            const winput: MessageItem = await ui.showWarningMessage(localize('windowsVersion', 'Which version of the runtime do you want to install?'), v1, v2);
            if (winput === v1) {
                await cpUtils.executeCommand(outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools');
            } else if (winput === v2) {
                await cpUtils.executeCommand(outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools@core', '--unsafe-perm', 'true');
            }
            break;
        case Platform.MacOS:
            try {
                await cpUtils.executeCommand(outputChannel, undefined, 'brew', 'tap', 'azure/functions');
                await cpUtils.executeCommand(outputChannel, undefined, 'brew', 'install', 'azure-functions-core-tools');
            } catch (error) {
                // if brew fails for whatever reason, fall back to npm
                await cpUtils.executeCommand(outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools@core', '--unsafe-perm', 'true');
            }
            break;
        default:
            break;
    }

    // validate that Func CLI was installed
    if (!(await funcCliInstalled())) {
        if (await ui.showWarningMessage(localize('failedInstallFuncCli', 'The Azure Functions Core Tools installion has failed and will have to be installed manually.'), DialogResponses.learnMore) === DialogResponses.learnMore) {
            // tslint:disable-next-line:no-unsafe-any
            opn('https://aka.ms/Dqur4e');
        }

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

async function funcCliInstalled(): Promise<boolean> {
    try {
        await cpUtils.executeCommand(undefined, undefined, 'func');
        return true;
    } catch (error) {
        return false;
    }
}

async function brewOrNpmInstalled(): Promise<boolean> {
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
