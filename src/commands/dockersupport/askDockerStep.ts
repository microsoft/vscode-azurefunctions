/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickOptions } from "vscode";
import { IActionContext, IAzureQuickPickItem } from "vscode-azureextensionui";
import { localize } from "../../localize";

/**
 * Provides top bar prompt UI asking the user if they'd like to use Docker with their cloned local project
 * @param context - Provides basic actions for functions
 * @returns - Yes/No response to using Docker with cloned local project
 */
export async function prompt(context: IActionContext): Promise<string> {
    const question: QuickPickOptions = { placeHolder: localize('useDocker', 'Use Docker to simplify your development experience?') };
    const responses: IAzureQuickPickItem<string>[] = [
        { label: 'Yes, use Docker', data: "yes" },
        { label: 'No, do not use Docker', data: "no" }
    ];

    const dockersupport: string = (await context.ui.showQuickPick(responses, question)).data;
    return dockersupport;
}
