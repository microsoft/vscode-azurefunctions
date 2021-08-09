/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IActionContext } from "vscode-azureextensionui";
import { localize } from '../localize';
import { cpUtils } from './cpUtils';

export namespace gradleUtils {
    const gradleCommand: string = 'gradle';

    export async function validateGradleInstalled(context: IActionContext): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, undefined, gradleCommand, '--version');
        } catch (error) {
            const message: string = localize('gradleNotFound', 'Failed to find "gradle", please ensure that the gradle bin directory is in your system path.');

            if (!context.errorHandling.suppressDisplay) {
                // don't wait
                void vscode.window.showErrorMessage(message);
                context.errorHandling.suppressDisplay = true;
            }

            throw new Error(message);
        }
    }
}
