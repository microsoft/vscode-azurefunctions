/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { createVirtualEnviornment } from '../commands/createNewProject/ProjectCreateStep/PythonProjectCreateStep';
import { extensionPrefix, pythonVenvSetting } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getWorkspaceSetting, updateGlobalSetting } from './settings';

export async function verifyPythonVenv(projectPath: string, context: IActionContext): Promise<void> {
    const settingKey: string = 'showPythonVenvWarning';
    if (getWorkspaceSetting<boolean>(settingKey)) {

        const venvName: string | undefined = getWorkspaceSetting(pythonVenvSetting, projectPath);
        if (venvName && !await fse.pathExists(path.join(projectPath, venvName))) {
            context.telemetry.properties.verifyConfigPrompt = 'createVenv';

            const createVenv: vscode.MessageItem = { title: localize('createVenv', 'Create virtual environment') };
            const message: string = localize('uninitializedWarning', 'Failed to find Python virtual environment "{0}", which is expected based on the setting "{1}.{2}".', venvName, extensionPrefix, pythonVenvSetting);
            const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, createVenv, DialogResponses.dontWarnAgain);
            if (result === createVenv) {
                context.errorHandling.suppressDisplay = false;
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: localize('creatingVenv', 'Creating virtual environment...') }, async () => {
                    // create venv
                    await createVirtualEnviornment(venvName, projectPath);
                });

                context.telemetry.properties.verifyConfigResult = 'update';
                // don't wait
                vscode.window.showInformationMessage(localize('finishedCreatingVenv', 'Finished creating virtual environment.'));
            } else if (result === DialogResponses.dontWarnAgain) {
                context.telemetry.properties.verifyConfigResult = 'dontWarnAgain';
                await updateGlobalSetting(settingKey, false);
            }
        }
    } else {
        context.telemetry.properties.verifyConfigResult = 'suppressed';
    }
}
