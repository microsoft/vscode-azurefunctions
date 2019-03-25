/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, workspace, WorkspaceFolder } from 'vscode';
import { AzureWizard, IActionContext, IWizardOptions, UserCancelledError } from 'vscode-azureextensionui';
import { ProjectLanguage, ProjectRuntime } from '../../constants';
import { NoWorkspaceError } from '../../errors';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { verifyAndPromptToCreateProject } from '../createNewProject/verifyIsProject';
import { verifyInitForVSCode } from '../initProjectForVSCode/verifyVSCodeConfig';
import { addFunctionSteps } from './FunctionListStep';
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
        let folder: WorkspaceFolder | undefined;
        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
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
        workspacePath = folder.uri.fsPath;
    }

    const projectPath: string | undefined = await verifyAndPromptToCreateProject(actionContext, workspacePath);
    if (!projectPath) {
        return;
    }

    [language, runtime] = await verifyInitForVSCode(actionContext, projectPath, language, runtime);

    const wizardContext: IFunctionWizardContext = { actionContext, projectPath, workspacePath, runtime, language, functionName };
    const wizardOptions: IWizardOptions<IFunctionWizardContext> = {};
    await addFunctionSteps(wizardContext, wizardOptions, { templateId, caseSensitiveFunctionSettings, isProjectWizard: false });
    const wizard: AzureWizard<IFunctionWizardContext> = new AzureWizard(wizardContext, wizardOptions);
    await wizard.prompt(actionContext);
    await wizard.execute(actionContext);
}
