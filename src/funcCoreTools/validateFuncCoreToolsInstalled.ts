/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import opn = require("opn");
import { MessageItem } from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getFuncExtensionSetting, updateGlobalSetting } from '../ProjectSettings';
import { cpUtils } from '../utils/cpUtils';
import { getFuncPackageManager } from './getFuncPackageManager';
import { installFuncCoreTools } from './installFuncCoreTools';

export async function validateFuncCoreToolsInstalled(forcePrompt: boolean = false, customMessage?: string): Promise<boolean> {
    let input: MessageItem | undefined;
    let installed: boolean = false;
    const install: MessageItem = { title: localize('install', 'Install') };

    await callWithTelemetryAndErrorHandling('azureFunctions.validateFuncCoreToolsInstalled', async function (this: IActionContext): Promise<void> {
        this.suppressErrorDisplay = true;
        this.properties.forcePrompt = String(forcePrompt);

        const settingKey: string = 'showFuncInstallation';
        if (forcePrompt || getFuncExtensionSetting<boolean>(settingKey)) {
            if (await funcToolsInstalled()) {
                installed = true;
            } else {
                const items: MessageItem[] = [];
                const message: string = customMessage ? customMessage : localize('installFuncTools', 'You must have the Azure Functions Core Tools installed to debug your local functions.');
                const packageManager: PackageManager | undefined = await getFuncPackageManager(false /* isFuncInstalled */);
                if (packageManager !== undefined) {
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
                    // See issue: https://github.com/Microsoft/vscode-azurefunctions/issues/535
                    input = await ext.ui.showWarningMessage(message, { modal: true }, ...items);
                } else {
                    input = await ext.ui.showWarningMessage(message, ...items);
                }

                this.properties.dialogResult = input.title;

                if (input === install) {
                    // tslint:disable-next-line:no-non-null-assertion
                    await installFuncCoreTools(packageManager!);
                    installed = true;
                } else if (input === DialogResponses.dontWarnAgain) {
                    await updateGlobalSetting(settingKey, false);
                } else if (input === DialogResponses.learnMore) {
                    await opn('https://aka.ms/Dqur4e');
                }
            }
        }
    });

    // validate that Func Tools was installed only if user confirmed
    if (input === install && !installed) {
        if (await ext.ui.showWarningMessage(localize('failedInstallFuncTools', 'The Azure Functions Core Tools installion has failed and will have to be installed manually.'), DialogResponses.learnMore) === DialogResponses.learnMore) {
            await opn('https://aka.ms/Dqur4e');
        }
    }

    return installed;
}

export async function funcToolsInstalled(): Promise<boolean> {
    try {
        await cpUtils.executeCommand(undefined, undefined, 'func', '--version');
        return true;
    } catch (error) {
        return false;
    }
}
