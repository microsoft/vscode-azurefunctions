/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, MessageItem, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import { AzureWizard, IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { ProjectLanguage, ProjectRuntime } from '../../constants';
import { NoWorkspaceError } from '../../errors';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import { verifyAndPromptToCreateProject } from '../createNewProject/verifyIsProject';
import { FunctionListStep } from './FunctionListStep';
import { IFunctionWizardContext } from './IFunctionWizardContext';

export async function createFunction(
    actionContext: IActionContext,
    workspacePath?: string,
    templateId?: string,
    functionName?: string,
    caseSensitiveFunctionSettings?: { [key: string]: string | undefined },
    language?: ProjectLanguage,
    runtime?: ProjectRuntime): Promise<void> {
    addLocalFuncTelemetry(actionContext);

    if (workspacePath === undefined) {
        workspacePath = await getWorkspacePath(actionContext);
    }

    const projectPath: string | undefined = await verifyAndPromptToCreateProject(actionContext, workspacePath);
    if (!projectPath) {
        return;
    }

    [language, runtime] = await verifyInitForVSCode(actionContext, projectPath, language, runtime);

    const wizardContext: IFunctionWizardContext = { actionContext, projectPath, workspacePath, runtime, language, functionName };
    const wizard: AzureWizard<IFunctionWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [await FunctionListStep.createFunctionListStep(wizardContext, { templateId, caseSensitiveFunctionSettings, isProjectWizard: false })]
    });
    await wizard.prompt(actionContext);
    await wizard.execute(actionContext);
}

async function getWorkspacePath(actionContext: IActionContext): Promise<string> {
    let folder: WorkspaceFolder | undefined;
    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
        const message: string = localize('noWorkspaceWarning', 'You must have a project open to create a function.');
        const newProject: MessageItem = { title: localize('createNewProject', 'Create new project') };
        const openExistingProject: MessageItem = { title: localize('openExistingProject', 'Open existing project') };
        const result: MessageItem = await ext.ui.showWarningMessage(message, { modal: true }, newProject, openExistingProject);

        if (result === newProject) {
            // don't wait
            commands.executeCommand('azureFunctions.createNewProject');
            actionContext.properties.noWorkspaceResult = 'createNewProject';
        } else {
            const uri: Uri[] = await ext.ui.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: localize('open', 'Open')
            });
            // don't wait
            commands.executeCommand('vscode.openFolder', uri[0]);
            actionContext.properties.noWorkspaceResult = 'openExistingProject';
        }

        actionContext.suppressErrorDisplay = true;
        throw new NoWorkspaceError();
    } else if (workspace.workspaceFolders.length === 1) {
        folder = workspace.workspaceFolders[0];
    } else {
        const placeHolder: string = localize('selectProjectFolder', 'Select the folder containing your function project');
        folder = await window.showWorkspaceFolderPick({ placeHolder });
        if (!folder) {
            throw new UserCancelledError();
        }
    }

    return folder.uri.fsPath;
}
