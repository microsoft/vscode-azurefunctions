/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, IActionContext, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { window, workspace, WorkspaceFolder } from 'vscode';
import { ProjectLanguage, projectTemplateKeySetting } from '../../constants';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { LocalProjectTreeItem } from '../../tree/localProject/LocalProjectTreeItem';
import { getContainingWorkspace } from '../../utils/workspace';
import * as api from '../../vscode-azurefunctions.api';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import { verifyOrCreateNewProject } from '../createNewProject/verifyIsProject';
import { FunctionListStep } from './FunctionListStep';
import { IFunctionWizardContext } from './IFunctionWizardContext';

/**
 * @deprecated Use AzureFunctionsExtensionApi.createFunction instead
 */
export async function createFunctionFromCommand(
    context: IActionContext,
    folderPath?: string | LocalProjectTreeItem,
    templateId?: string,
    functionName?: string,
    functionSettings?: { [key: string]: string | undefined },
    language?: ProjectLanguage,
    version?: FuncVersion): Promise<void> {

    if (folderPath && typeof folderPath !== 'string') {
        folderPath = undefined;
    }

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
    let workspaceFolder: WorkspaceFolder | undefined;
    let workspacePath: string | undefined = options.folderPath;

    if (workspacePath === undefined) {
        workspaceFolder = await getWorkspaceFolder();
        workspacePath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
    } else {
        workspaceFolder = getContainingWorkspace(workspacePath);
    }

    const projectPath: string | undefined = await verifyOrCreateNewProject(context, workspaceFolder || workspacePath, options);
    if (!projectPath) {
        // This path covers creating a new project workspace which will cause us to lose execution context
        return;
    }

    addLocalFuncTelemetry(context, workspacePath);

    const { language, languageModel, version } = await verifyInitForVSCode(context, projectPath, options.language, /* TODO: languageModel: */ undefined, options.version);

    const projectTemplateKey: string | undefined = getWorkspaceSetting(projectTemplateKeySetting, projectPath);
    const wizardContext: IFunctionWizardContext = Object.assign(context, options, { projectPath, workspacePath, workspaceFolder, version, language, languageModel, projectTemplateKey });
    const wizard: AzureWizard<IFunctionWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [await FunctionListStep.create(wizardContext, { templateId: options.templateId, functionSettings: options.functionSettings, isProjectWizard: false })]
    });
    await wizard.prompt();
    await wizard.execute();
}

async function getWorkspaceFolder(): Promise<WorkspaceFolder | undefined> {
    let folder: WorkspaceFolder | undefined;

    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
        folder = undefined;
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
