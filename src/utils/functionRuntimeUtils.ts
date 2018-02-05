/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as opn from 'opn';
import * as vscode from 'vscode';
import { extensionPrefix } from '../../src/ProjectSettings';
import { DialogResponses } from '../DialogResponses';
import { localize } from '../localize';
import { cpUtils } from './cpUtils';

export namespace functionRuntimeUtils {

    const runtimePackage: string = 'azure-functions-core-tools';

    export async function validateFunctionRuntimeInstallation(outputChannel: vscode.OutputChannel): Promise<void> {
        try {
            await cpUtils.executeCommand(outputChannel, undefined, 'func');
        } catch (error) {
            const message: string = localize('azFunc.noFunctionRuntime', '[Azure Functions] Azure-functions-core-tools is not installed. Please update it otherwise Azure Functions extension may fail.');
            await promptUserAction(message);
        }

        if (!await isNpmInstalled(outputChannel)) {
            return;
        }

        const outdatedInfo: string = await cpUtils.executeCommand(outputChannel, undefined, 'npm', 'outdated', runtimePackage, '-g');
        const runtimeDetail: string[] = outdatedInfo.slice(outdatedInfo.indexOf(runtimePackage)).trim().split(/\s+/);
        if (runtimeDetail[1] !== runtimeDetail[2]) {
            const message: string = localize(
                'azFunc.outdatedFunctionRuntime',
                '[Azure Functions] Azure-functions-core-tools is outdated. Please update it otherwise Azure Functions extension may fail.'
            );
            await promptUserAction(message);
        }
    }

    async function isNpmInstalled(outputChannel: vscode.OutputChannel): Promise<boolean> {
        try {
            await cpUtils.executeCommand(outputChannel, undefined, 'npm', '--version');
            return true;
        } catch (error) {
            const message: string = localize(
                'azFunc.npmNotFound',
                '[Azure Functions] Failed to check function runtime version caused by "npm" not in path, would you like to check the document for the prerequisites?'
            );
            await promptUserAction(message);
            return false;
        }
    }

    async function promptUserAction(message: string): Promise<void> {
        const result: vscode.MessageItem | undefined = await vscode.window.showWarningMessage(message, DialogResponses.yes, DialogResponses.skipForNow, DialogResponses.neverAskWithNo);
        if (result === DialogResponses.yes) {
            // tslint:disable-next-line:no-unsafe-any
            opn('https://github.com/Microsoft/vscode-azurefunctions#prerequisites');
        } else if (result === DialogResponses.neverAskWithNo) {
            await updateCheckingRuntimeSetting(false);
        }
    }

    async function updateCheckingRuntimeSetting(value: boolean): Promise<void> {
        vscode.workspace.getConfiguration(extensionPrefix).update('checkFunctionRuntime', value, true /* User Setting */);
    }
}
