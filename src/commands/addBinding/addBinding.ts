/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, WorkspaceFolder } from "vscode";
import { AzureWizard, IActionContext } from "vscode-azureextensionui";
import { ProjectLanguage } from "../../constants";
import { FuncVersion } from "../../FuncVersion";
import { LocalBindingsTreeItem } from "../../tree/localProject/LocalBindingsTreeItem";
import { nonNullValue } from "../../utils/nonNull";
import { getContainingWorkspace } from "../../utils/workspace";
import { verifyInitForVSCode } from "../../vsCodeConfig/verifyInitForVSCode";
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
        const [language, version]: [ProjectLanguage, FuncVersion] = await verifyInitForVSCode(context, projectPath);

        const wizardContext: IBindingWizardContext = Object.assign(context, { functionJsonPath: data.fsPath, workspacePath, projectPath, workspaceFolder, language, version });
        const wizard: AzureWizard<IBindingWizardContext> = createBindingWizard(wizardContext);
        await wizard.prompt();
        await wizard.execute();
    } else {
        await createChildNode(context, /Local;ReadWrite;Bindings;/i, data);
    }
}
