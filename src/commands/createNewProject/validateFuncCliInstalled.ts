/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as opn from 'opn';
import { MessageItem, OutputChannel } from 'vscode';
import { DialogResponses, IAzureUserInput } from 'vscode-azureextensionui';
import { Platform } from '../../constants';
import { localize } from '../../localize';
import { updateGlobalSetting } from '../../ProjectSettings';
import { cpUtils } from '../../utils/cpUtils';
import { functionRuntimeUtils } from '../../utils/functionRuntimeUtils';

export async function validateFuncCliInstalled(ui: IAzureUserInput, outputChannel: OutputChannel): Promise<void> {
    const runtime: string | null = await functionRuntimeUtils.getLocalFunctionRuntimeVersion();
    const settingKey: string = 'showFuncInstallation';
    if (runtime === null && process.platform !== Platform.Linux) {
        // command currently does not support Linux
        const input: MessageItem = await ui.showWarningMessage(localize('installFuncCli', 'You need Azure Functions Core Tools CLI to locally debug your functions.  Run {0} now?', getCommandForPlatform()), DialogResponses.yes, DialogResponses.dontWarnAgain, DialogResponses.skipForNow);
        if (input === DialogResponses.yes) {
            attemptToInstallLatestFunctionRuntime(ui, outputChannel);
        } else if (input === DialogResponses.dontWarnAgain) {
            await updateGlobalSetting(settingKey, false);
        }
    }
}

async function attemptToInstallLatestFunctionRuntime(ui: IAzureUserInput, outputChannel: OutputChannel): Promise<void> {
    try {
        switch (process.platform) {
            case Platform.Windows:
                await cpUtils.executeCommand(outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools@core');
                break;
            case Platform.MacOS:
                await cpUtils.executeCommand(outputChannel, undefined, 'brew', 'tap', 'azure/functions');
                await cpUtils.executeCommand(outputChannel, undefined, 'brew', 'install', 'azure-functions-core-tools');
                break;
            default:
                break;
        }
    } catch (error) {
        // swallow the error
    } finally {
        // validate that Func CLI was installed
        if (await functionRuntimeUtils.getLocalFunctionRuntimeVersion() === null) {
            await (await ui.showWarningMessage(localize('failedInstallFuncCli', 'The Azure Functions Core Tools CLI installion has failed and will have to be installed manually.'), DialogResponses.learnMore) === DialogResponses.learnMore); {
                opn('https://github.com/Azure/azure-functions-core-tools#installing');
            }
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
