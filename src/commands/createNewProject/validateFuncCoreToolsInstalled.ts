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

export async function validateFuncCoreToolsInstalled(forcePrompt: boolean = false): Promise<boolean> {
    let input: MessageItem | undefined;
    let installed: boolean = false;
    const install: MessageItem = { title: localize('install', 'Install') };

    await callWithTelemetryAndErrorHandling('azureFunctions.validateFuncCoreToolsInstalled', ext.reporter, undefined, async function (this: IActionContext): Promise<void> {
        this.suppressErrorDisplay = true;
        this.properties.forcePrompt = String(forcePrompt);

        const settingKey: string = 'showFuncInstallation';
        if (forcePrompt || getFuncExtensionSetting<boolean>(settingKey)) {
            if (await funcToolsInstalled()) {
                installed = true;
            } else {
                const items: MessageItem[] = [];
                const message: string = localize('installFuncTools', 'You must have the Azure Functions Core Tools installed to debug your local functions.');
                if (await canInstallFuncCoreTools()) {
                    items.push(install);
                    if (!forcePrompt) {
                        items.push(DialogResponses.skipForNow);
                    } else {
                        items.push(DialogResponses.cancel);
                    }
                } else {
                    items.push(DialogResponses.learnMore);
                }

                if (!forcePrompt) {
                    items.push(DialogResponses.dontWarnAgain);
                }

                if (forcePrompt) {
                    input = await ext.ui.showWarningMessage(message, { modal: true }, ...items);
                } else {
                    input = await ext.ui.showWarningMessage(message, ...items);
                }

                this.properties.dialogResult = input.title;

                if (input === install) {
                    await attemptToInstallLatestFunctionRuntime();
                    installed = true;
                } else if (input === DialogResponses.dontWarnAgain) {
                    await updateGlobalSetting(settingKey, false);
                } else if (input === DialogResponses.learnMore) {
                    // tslint:disable-next-line:no-unsafe-any
                    opn('https://aka.ms/Dqur4e');
                }
            }
        }
    });

    // validate that Func Tools was installed only if user confirmed
    if (input === install && !installed) {
        if (await ext.ui.showWarningMessage(localize('failedInstallFuncTools', 'The Azure Functions Core Tools installion has failed and will have to be installed manually.'), DialogResponses.learnMore) === DialogResponses.learnMore) {
            // tslint:disable-next-line:no-unsafe-any
            opn('https://aka.ms/Dqur4e');
        }
    }

    return installed;
}

export async function attemptToInstallLatestFunctionRuntime(runtimeVersion?: string): Promise<void> {
    switch (process.platform) {
        case Platform.Windows:
            const v1: string = 'v1';
            const v2: string = 'v2';
            if (!runtimeVersion) {
                const v1MsgItm: MessageItem = { title: v1 };
                const v2MsgItm: MessageItem = { title: v2 };
                runtimeVersion = (await ext.ui.showWarningMessage(localize('windowsVersion', 'Which version of the runtime do you want to install?'), v1MsgItm, v2MsgItm)).title;
            }

            ext.outputChannel.show();
            if (runtimeVersion === v1) {
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools');
            } else if (runtimeVersion === v2) {
                await cpUtils.executeCommand(ext.outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools@core', '--unsafe-perm', 'true');
            }
            break;
        case Platform.MacOS:
            ext.outputChannel.show();
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

export async function funcToolsInstalled(): Promise<boolean> {
    try {
        await cpUtils.executeCommand(undefined, undefined, 'func', '--version');
        return true;
    } catch (error) {
        return false;
    }
}

export async function canInstallFuncCoreTools(): Promise<boolean> {
    switch (process.platform) {
        case Platform.Linux:
            // https://github.com/Microsoft/vscode-azurefunctions/issues/311
            return false;
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
