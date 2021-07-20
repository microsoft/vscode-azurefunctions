/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, MessageItem, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import { AzureWizard, IActionContext, UserCancelledError } from 'vscode-azureextensionui';
import { ProjectLanguage, projectTemplateKeySetting } from '../../constants';
import { NoWorkspaceError } from '../../errors';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { getContainingWorkspace } from '../../utils/workspace';
import * as api from '../../vscode-azurefunctions.api';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import { verifyAndPromptToCreateProject } from '../createNewProject/verifyIsProject';
import { FunctionListStep } from './FunctionListStep';
import { IFunctionWizardContext } from './IFunctionWizardContext';

/**
 * @deprecated Use AzureFunctionsExtensionApi.createFunction instead
 */
export async function createFunctionFromCommand(
    context: IActionContext,
    folderPath?: string,
    templateId?: string,
    functionName?: string,
    functionSettings?: { [key: string]: string | undefined },
    language?: ProjectLanguage,
    version?: FuncVersion): Promise<void> {

    await createFunctionInternal(context, {
        folderPath,
        templateId,
        functionName,
        functionSettings,
        language: <api.ProjectLanguage>language,
        version: <api.ProjectVersion>version
    });
}

export async function createFunctionInternal(context: IActionContext, options: api.ICreateFunctionOptions): Promise<void> {
    addLocalFuncTelemetry(context);

    let workspaceFolder: WorkspaceFolder | undefined;
    let workspacePath: string | undefined = options.folderPath;
    if (workspacePath === undefined) {
        workspaceFolder = await getWorkspaceFolder(context);
        workspacePath = workspaceFolder.uri.fsPath;
    } else {
        workspaceFolder = getContainingWorkspace(workspacePath);
    }

    const projectPath: string | undefined = await verifyAndPromptToCreateProject(context, workspaceFolder || workspacePath, options);
    if (!projectPath) {
        return;
    }

    const [language, version] = await verifyInitForVSCode(context, projectPath, options.language, options.version);
    const projectTemplateKey: string | undefined = getWorkspaceSetting(projectTemplateKeySetting, projectPath);
    const wizardContext: IFunctionWizardContext = Object.assign(context, options, { projectPath, workspacePath, workspaceFolder, version, language, projectTemplateKey });
    const wizard: AzureWizard<IFunctionWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [await FunctionListStep.create(wizardContext, { templateId: options.templateId, functionSettings: options.functionSettings, isProjectWizard: false })]
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
        const result: MessageItem = await context.ui.showWarningMessage(message, { modal: true, stepName: 'mustOpenProject' }, newProject, openExistingProject);

        if (result === newProject) {
            // don't wait
            void commands.executeCommand('azureFunctions.createNewProject');
            context.telemetry.properties.noWorkspaceResult = 'createNewProject';
        } else {
            const uri: Uri[] = await context.ui.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: localize('open', 'Open'),
                stepName: 'mustOpenProject|selectExisting'
            });
            // don't wait
            void commands.executeCommand('vscode.openFolder', uri[0]);
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
            throw new UserCancelledError('selectProjectFolder');
        }
    }

    return folder;
}
