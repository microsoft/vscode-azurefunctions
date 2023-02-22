/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { localize } from '../localize';
import { cpUtils } from './cpUtils';

export namespace ballerinaUtils {
    const ballerinaCommand: string = 'bal';

    export async function validateBallerinaInstalled(context: IActionContext): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, undefined, ballerinaCommand, '--version');
        } catch (error) {
            const message: string = localize('ballerinaNotFound', 'Failed to find "bal", please ensure that the bal bin directory is in your system path.');

            if (!context.errorHandling.suppressDisplay) {
                // don't wait
                void vscode.window.showErrorMessage(message);
                context.errorHandling.suppressDisplay = true;
            }

            throw new Error(message);
        }
    }
}
