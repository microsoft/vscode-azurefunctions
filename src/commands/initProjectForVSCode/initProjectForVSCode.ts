/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, workspace, WorkspaceFolder } from 'vscode';
import { AzureWizard, IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { ProjectLanguage, projectLanguageSetting } from '../../constants';
import { NoWorkspaceError } from '../../errors';
import { localize } from '../../localize';
import { getContainingWorkspace } from '../../utils/workspace';
import { getGlobalSetting } from '../../vsCodeConfig/settings';
import { IProjectWizardContext } from '../createNewProject/IProjectWizardContext';
import { verifyAndPromptToCreateProject } from '../createNewProject/verifyIsProject';
import { detectProjectLanguage } from './detectProjectLanguage';
import { InitVSCodeLanguageStep } from './InitVSCodeLanguageStep';

export async function initProjectForVSCode(actionContext: IActionContext, fsPath?: string, language?: ProjectLanguage): Promise<void> {
    let workspaceFolder: WorkspaceFolder | undefined;
    let workspacePath: string;
    if (fsPath === undefined) {
        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            throw new NoWorkspaceError();
        } else {
            const placeHolder: string = localize('selectFunctionAppFolderNew', 'Select the folder to initialize for use with VS Code');
            workspaceFolder = await window.showWorkspaceFolderPick({ placeHolder });
            if (!workspaceFolder) {
                throw new UserCancelledError();
            } else {
                workspacePath = workspaceFolder.uri.fsPath;
            }
        }
    } else {
        workspaceFolder = getContainingWorkspace(fsPath);
        workspacePath = workspaceFolder ? workspaceFolder.uri.fsPath : fsPath;
    }

    const projectPath: string | undefined = await verifyAndPromptToCreateProject(actionContext, workspacePath);
    if (!projectPath) {
        return;
    }

    // tslint:disable-next-line: strict-boolean-expressions
    language = language || getGlobalSetting(projectLanguageSetting) || await detectProjectLanguage(projectPath);

    const wizardContext: IProjectWizardContext = { projectPath, workspacePath, actionContext, language, workspaceFolder };
    const wizard: AzureWizard<IProjectWizardContext> = new AzureWizard(wizardContext, { promptSteps: [new InitVSCodeLanguageStep()] });
    await wizard.prompt(actionContext);
    await wizard.execute(actionContext);

    // don't wait
    window.showInformationMessage(localize('finishedInitializing', 'Finished initializing for use with VS Code.'));
}
