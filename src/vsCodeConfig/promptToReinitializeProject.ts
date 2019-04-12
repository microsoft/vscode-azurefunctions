/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getWorkspaceSetting, updateWorkspaceSetting } from './settings';

export async function promptToReinitializeProject(fsPath: string, settingKey: string, message: string, learnMoreLink: string, actionContext: IActionContext): Promise<boolean> {
    if (getWorkspaceSetting<boolean>(settingKey)) {
        const updateConfig: vscode.MessageItem = { title: localize('reinit', 'Reinitialize Project') };
        const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, { learnMoreLink }, updateConfig, DialogResponses.dontWarnAgain);
        if (result === DialogResponses.dontWarnAgain) {
            actionContext.properties.verifyConfigResult = 'dontWarnAgain';
            await updateWorkspaceSetting(settingKey, false, fsPath);
        } else {
            actionContext.properties.verifyConfigResult = 'update';
            return true;
        }
    } else {
        actionContext.properties.verifyConfigResult = 'suppressed';
    }

    return false;
}
