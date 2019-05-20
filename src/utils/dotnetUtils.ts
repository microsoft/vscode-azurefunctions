/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from "vscode-azureextensionui";
import { localize } from "../localize";
import { cpUtils } from "./cpUtils";
import { openUrl } from './openUrl';

export namespace dotnetUtils {
    export async function isDotnetInstalled(): Promise<boolean> {
        try {
            await cpUtils.executeCommand(undefined, undefined, 'dotnet', '--version');
            return true;
        } catch (error) {
            return false;
        }
    }

    export async function validateDotnetInstalled(context: IActionContext): Promise<void> {
        if (!await isDotnetInstalled()) {
            const message: string = localize('dotnetNotInstalled', 'You must have the .NET CLI installed to perform this operation.');

            if (!context.errorHandling.suppressDisplay) {
                // don't wait
                vscode.window.showErrorMessage(message, DialogResponses.learnMore).then(async (result) => {
                    if (result === DialogResponses.learnMore) {
                        await openUrl('https://aka.ms/AA4ac70');
                    }
                });
                context.errorHandling.suppressDisplay = true;
            }

            throw new Error(message);
        }
    }
}
