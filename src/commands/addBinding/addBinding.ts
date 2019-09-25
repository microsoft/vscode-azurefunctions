/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, WorkspaceFolder } from "vscode";
import { AzureWizard, IActionContext } from "vscode-azureextensionui";
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting } from "../../constants";
import { LocalBindingsTreeItem } from "../../tree/localProject/LocalBindingsTreeItem";
import { nonNullValue } from "../../utils/nonNull";
import { getContainingWorkspace } from "../../utils/workspace";
import { getWorkspaceSetting } from "../../vsCodeConfig/settings";
import { createChildNode } from "../createChildNode";
import { tryGetFunctionProjectRoot } from "../createNewProject/verifyIsProject";
import { createBindingWizard } from "./createBindingWizard";
import { IBindingWizardContext } from "./IBindingWizardContext";

export async function addBinding(context: IActionContext, data: Uri | LocalBindingsTreeItem | undefined): Promise<void> {
    if (data instanceof Uri) {
        const functionJsonPath: string = data.fsPath;
        const workspaceFolder: WorkspaceFolder = nonNullValue(getContainingWorkspace(functionJsonPath), 'workspaceFolder');
        const workspacePath: string = workspaceFolder.uri.fsPath;
        const projectPath: string | undefined = await tryGetFunctionProjectRoot(workspacePath) || workspacePath;
        const language: ProjectLanguage | undefined = getWorkspaceSetting(projectLanguageSetting, projectPath);
        const runtime: ProjectRuntime | undefined = getWorkspaceSetting(projectRuntimeSetting, projectPath);

        const wizardContext: IBindingWizardContext = Object.assign(context, { functionJsonPath: data.fsPath, workspacePath, projectPath, workspaceFolder, language, runtime });
        const wizard: AzureWizard<IBindingWizardContext> = createBindingWizard(wizardContext);
        await wizard.prompt();
        await wizard.execute();
    } else {
        await createChildNode(context, /Local;ReadWrite;Bindings;/i, data);
    }
}
