/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageItem } from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { PackageManager } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { cpUtils } from '../utils/cpUtils';
import { openUrl } from '../utils/openUrl';
import { getFuncPackageManager } from './getFuncPackageManager';
import { installFuncCoreTools } from './installFuncCoreTools';

export async function validateFuncCoreToolsInstalled(customMessage?: string): Promise<boolean> {
    let input: MessageItem | undefined;
    let installed: boolean = false;
    const install: MessageItem = { title: localize('install', 'Install') };

    await callWithTelemetryAndErrorHandling('azureFunctions.validateFuncCoreToolsInstalled', async function (this: IActionContext): Promise<void> {
        this.suppressErrorDisplay = true;

        if (await funcToolsInstalled()) {
            installed = true;
        } else {
            const items: MessageItem[] = [];
            const message: string = customMessage ? customMessage : localize('installFuncTools', 'You must have the Azure Functions Core Tools installed to debug your local functions.');
            const packageManager: PackageManager | undefined = await getFuncPackageManager(false /* isFuncInstalled */);
            if (packageManager !== undefined) {
                items.push(install);
            } else {
                items.push(DialogResponses.learnMore);
            }

            // See issue: https://github.com/Microsoft/vscode-azurefunctions/issues/535
            input = await ext.ui.showWarningMessage(message, { modal: true }, ...items);

            this.properties.dialogResult = input.title;

            if (input === install) {
                // tslint:disable-next-line:no-non-null-assertion
                await installFuncCoreTools(packageManager!);
                installed = true;
            } else if (input === DialogResponses.learnMore) {
                await openUrl('https://aka.ms/Dqur4e');
            }
        }
    });

    // validate that Func Tools was installed only if user confirmed
    if (input === install && !installed) {
        if (await ext.ui.showWarningMessage(localize('failedInstallFuncTools', 'The Azure Functions Core Tools installion has failed and will have to be installed manually.'), DialogResponses.learnMore) === DialogResponses.learnMore) {
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
