/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, WorkspaceFolder } from "vscode";
import { AzureWizard, IActionContext } from "vscode-azureextensionui";
import { ProjectLanguage } from "../../constants";
import { ext } from "../../extensionVariables";
import { FuncVersion } from "../../FuncVersion";
import { localize } from "../../localize";
import { LocalFunctionTreeItem } from "../../tree/localProject/LocalFunctionTreeItem";
import { nonNullValue } from "../../utils/nonNull";
import { getContainingWorkspace } from "../../utils/workspace";
import { verifyInitForVSCode } from "../../vsCodeConfig/verifyInitForVSCode";
import { tryGetFunctionProjectRoot } from "../createNewProject/verifyIsProject";
import { createBindingWizard } from "./createBindingWizard";
import { IBindingWizardContext } from "./IBindingWizardContext";

export async function addBinding(context: IActionContext, data: Uri | LocalFunctionTreeItem | undefined): Promise<void> {
    let functionJsonPath: string;
    let workspaceFolder: WorkspaceFolder;
    let workspacePath: string;
    let projectPath: string | undefined;

    if (data instanceof Uri) {
        functionJsonPath = data.fsPath;
        workspaceFolder = nonNullValue(getContainingWorkspace(functionJsonPath), 'workspaceFolder');
        workspacePath = workspaceFolder.uri.fsPath;
        projectPath = await tryGetFunctionProjectRoot(workspacePath) || workspacePath;
    } else {
        if (!data) {
            const noItemFoundErrorMessage: string = localize('noLocalProject', 'No matching functions found. C# and Java projects do not support this operation.');
            data = await ext.tree.showTreeItemPicker<LocalFunctionTreeItem>(/Local;ReadWrite;Function;/i, { ...context, noItemFoundErrorMessage });
        }

        functionJsonPath = data.functionJsonPath;
        workspaceFolder = data.parent.parent.workspaceFolder;
        workspacePath = data.parent.parent.workspacePath;
        projectPath = data.parent.parent.effectiveProjectPath;
    }

    const [language, version]: [ProjectLanguage, FuncVersion] = await verifyInitForVSCode(context, projectPath);
    const wizardContext: IBindingWizardContext = Object.assign(context, { functionJsonPath, workspacePath, projectPath, workspaceFolder, language, version });
    const wizard: AzureWizard<IBindingWizardContext> = createBindingWizard(wizardContext);
    await wizard.prompt();
    await wizard.execute();
}
