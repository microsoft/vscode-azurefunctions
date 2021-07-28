/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { initProjectForVSCode } from '../commands/initProjectForVSCode/initProjectForVSCode';
import { localize } from '../localize';
import { getWorkspaceSetting, updateWorkspaceSetting } from './settings';

export async function promptToReinitializeProject(fsPath: string, settingKey: string, message: string, learnMoreLink: string, context: IActionContext): Promise<void> {
    if (getWorkspaceSetting<boolean>(settingKey)) {
        const updateConfig: vscode.MessageItem = { title: localize('reinit', 'Reinitialize Project') };
        const result: vscode.MessageItem = await context.ui.showWarningMessage(message, { learnMoreLink, stepName: 'reinitProject' }, updateConfig, DialogResponses.dontWarnAgain);
        if (result === DialogResponses.dontWarnAgain) {
            context.telemetry.properties.verifyConfigResult = 'dontWarnAgain';
            await updateWorkspaceSetting(settingKey, false, fsPath);
        } else {
            context.telemetry.properties.verifyConfigResult = 'update';
            await initProjectForVSCode(context, fsPath);
        }
    } else {
        context.telemetry.properties.verifyConfigResult = 'suppressed';
    }
}
