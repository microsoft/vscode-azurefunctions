/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureWizard, DialogResponses, IActionContext } from 'vscode-azureextensionui';
import { IPythonVenvWizardContext } from '../commands/createNewProject/pythonSteps/IPythonVenvWizardContext';
import { PythonAliasListStep } from '../commands/createNewProject/pythonSteps/PythonAliasListStep';
import { PythonVenvCreateStep } from '../commands/createNewProject/pythonSteps/PythonVenvCreateStep';
import { pythonVenvSetting } from '../constants';
import { ext } from '../extensionVariables';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { getWorkspaceSetting, updateGlobalSetting } from './settings';

export async function verifyPythonVenv(projectPath: string, context: IActionContext, version: FuncVersion): Promise<void> {
    const settingKey: string = 'showPythonVenvWarning';
    if (getWorkspaceSetting<boolean>(settingKey)) {

        const venvName: string | undefined = getWorkspaceSetting(pythonVenvSetting, projectPath);
        if (venvName && !await fse.pathExists(path.join(projectPath, venvName))) {
            context.telemetry.properties.verifyConfigPrompt = 'createVenv';

            const createVenv: vscode.MessageItem = { title: localize('createVenv', 'Create virtual environment') };
            const message: string = localize('uninitializedWarning', 'Failed to find Python virtual environment "{0}", which is expected based on the setting "{1}.{2}".', venvName, ext.prefix, pythonVenvSetting);
            const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, createVenv, DialogResponses.dontWarnAgain);
            if (result === createVenv) {
                context.errorHandling.suppressDisplay = false;
                context.telemetry.properties.verifyConfigResult = 'update';

                const wizardContext: IPythonVenvWizardContext = { ...context, version, venvName, projectPath, suppressSkipVenv: true };
                const wizard: AzureWizard<IPythonVenvWizardContext> = new AzureWizard(wizardContext, {
                    promptSteps: [new PythonAliasListStep()],
                    executeSteps: [new PythonVenvCreateStep()],
                    title: localize('createVenv', 'Create virtual environment')
                });
                await wizard.prompt();
                await wizard.execute();

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
