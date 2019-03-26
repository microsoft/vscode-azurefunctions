/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, workspace, WorkspaceFolder } from 'vscode';
import { AzureWizard, IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { ProjectLanguage, projectLanguageSetting } from '../../constants';
import { NoWorkspaceError } from '../../errors';
import { localize } from '../../localize';
import { getGlobalFuncExtensionSetting } from '../../ProjectSettings';
import { IProjectWizardContext } from '../createNewProject/IProjectWizardContext';
import { verifyAndPromptToCreateProject } from '../createNewProject/verifyIsProject';
import { detectProjectLanguage } from './detectProjectLanguage';
import { InitVSCodeLanguageStep } from './InitVSCodeLanguageStep';

export async function initProjectForVSCode(actionContext: IActionContext, workspacePath?: string, language?: ProjectLanguage): Promise<void> {
    if (workspacePath === undefined) {
        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            throw new NoWorkspaceError();
        } else {
            const placeHolder: string = localize('selectFunctionAppFolderNew', 'Select the folder to initialize for use with VS Code');
            const folder: WorkspaceFolder | undefined = await window.showWorkspaceFolderPick({ placeHolder });
            if (!folder) {
                throw new UserCancelledError();
            } else {
                workspacePath = folder.uri.fsPath;
            }
        }
    }

    const projectPath: string | undefined = await verifyAndPromptToCreateProject(actionContext, workspacePath);
    if (!projectPath) {
        return;
    }

    // tslint:disable-next-line: strict-boolean-expressions
    language = language || getGlobalFuncExtensionSetting(projectLanguageSetting) || await detectProjectLanguage(projectPath);

    const wizardContext: IProjectWizardContext = { projectPath, workspacePath, actionContext, language };
    const wizard: AzureWizard<IProjectWizardContext> = new AzureWizard(wizardContext, { promptSteps: [new InitVSCodeLanguageStep()] });
    await wizard.prompt(actionContext);
    await wizard.execute(actionContext);

    // don't wait
    window.showInformationMessage(localize('finishedInitializing', 'Finished initializing for use with VS Code.'));
}
