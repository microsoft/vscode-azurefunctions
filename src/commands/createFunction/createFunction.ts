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
import { getContainingWorkspace } from '../../utils/workspace';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import { verifyAndPromptToCreateProject } from '../createNewProject/verifyIsProject';
import { FunctionListStep } from './FunctionListStep';
import { IFunctionWizardContext } from './IFunctionWizardContext';

export async function createFunction(
    context: IActionContext,
    workspacePath?: string,
    templateId?: string,
    functionName?: string,
    triggerSettings?: { [key: string]: string | undefined },
    language?: ProjectLanguage,
    runtime?: ProjectRuntime): Promise<void> {
    addLocalFuncTelemetry(context);

    let workspaceFolder: WorkspaceFolder | undefined;
    if (workspacePath === undefined) {
        workspaceFolder = await getWorkspaceFolder(context);
        workspacePath = workspaceFolder.uri.fsPath;
    } else {
        workspaceFolder = getContainingWorkspace(workspacePath);
    }

    const projectPath: string | undefined = await verifyAndPromptToCreateProject(context, workspacePath);
    if (!projectPath) {
        return;
    }

    [language, runtime] = await verifyInitForVSCode(context, projectPath, language, runtime);

    const wizardContext: IFunctionWizardContext = Object.assign(context, { projectPath, workspacePath, workspaceFolder, runtime, language, functionName });
    const wizard: AzureWizard<IFunctionWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [await FunctionListStep.create(wizardContext, { templateId, triggerSettings, isProjectWizard: false })]
    });
    await wizard.prompt();
    await wizard.execute();
}

async function getWorkspaceFolder(context: IActionContext): Promise<WorkspaceFolder> {
    let folder: WorkspaceFolder | undefined;
    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
        const message: string = localize('noWorkspaceWarning', 'You must have a project open to create a function.');
        const newProject: MessageItem = { title: localize('createNewProject', 'Create new project') };
        const openExistingProject: MessageItem = { title: localize('openExistingProject', 'Open existing project') };
        const result: MessageItem = await ext.ui.showWarningMessage(message, { modal: true }, newProject, openExistingProject);

        if (result === newProject) {
            // don't wait
            commands.executeCommand('azureFunctions.createNewProject');
            context.telemetry.properties.noWorkspaceResult = 'createNewProject';
        } else {
            const uri: Uri[] = await ext.ui.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: localize('open', 'Open')
            });
            // don't wait
            commands.executeCommand('vscode.openFolder', uri[0]);
            context.telemetry.properties.noWorkspaceResult = 'openExistingProject';
        }

        context.errorHandling.suppressDisplay = true;
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

    return folder;
}
