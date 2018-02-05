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
import { nodeUtils } from './nodeUtils';

export namespace functionRuntimeUtils {

    const runtimePackage: string = 'azure-functions-core-tools';

    export async function validateFunctionRuntime(outputChannel: vscode.OutputChannel): Promise<void> {
        const errorMessage: string | undefined = await getRuntimeValidationError(outputChannel);
        if (errorMessage) {
            await promptDocumentationAction(errorMessage);
        }
    }

    async function getRuntimeValidationError(outputChannel: vscode.OutputChannel): Promise<string | undefined> {
        try {
            await cpUtils.executeCommand(outputChannel, undefined, 'func');
        } catch (error) {
            return localize(
                'azFunc.noFunctionRuntime',
                '[Azure Functions] Azure-functions-core-tools is not installed. Please install it otherwise Azure Functions extension may fail.'
            );
        }

        try {
            await nodeUtils.validateNpmInstalled(outputChannel);
        } catch (error) {
            return localize(
                'azFunc.npmNotFound',
                '[Azure Functions] Failed to check function runtime version caused by "npm" not in path, would you like to check the document for the prerequisites?'
            );
        }

        const outdatedInfo: string = await cpUtils.executeCommand(outputChannel, undefined, 'npm', 'outdated', runtimePackage, '-g');
        const runtimeDetail: string[] = outdatedInfo.slice(outdatedInfo.indexOf(runtimePackage)).trim().split(/\s+/);
        if (runtimeDetail[1] !== runtimeDetail[2]) {
            return localize(
                'azFunc.outdatedFunctionRuntime',
                '[Azure Functions] New Function Runtime version "{0}" found. Current is "{1}". Please update it otherwise Azure Functions extension may fail.',
                runtimeDetail[2],
                runtimeDetail[1]
            );
        }

        return undefined;
    }

    async function promptDocumentationAction(message: string): Promise<void> {
        const result: vscode.MessageItem | undefined = await vscode.window.showWarningMessage(message, DialogResponses.openDocument, DialogResponses.skipForNow, DialogResponses.never);
        if (result === DialogResponses.openDocument) {
            // tslint:disable-next-line:no-unsafe-any
            opn('https://github.com/Microsoft/vscode-azurefunctions#prerequisites');
        } else if (result === DialogResponses.never) {
            await updateCheckingRuntimeSetting(false);
        }
    }

    async function updateCheckingRuntimeSetting(value: boolean): Promise<void> {
        vscode.workspace.getConfiguration(extensionPrefix).update('checkFunctionRuntime', value, true /* User Setting */);
    }
}
