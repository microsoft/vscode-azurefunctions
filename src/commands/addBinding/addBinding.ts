/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizard, type IActionContext } from "@microsoft/vscode-azext-utils";
import { Uri, type WorkspaceFolder } from "vscode";
import { type FuncVersion } from "../../FuncVersion";
import { projectTemplateKeySetting, type ProjectLanguage } from "../../constants";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { type LocalFunctionTreeItem } from "../../tree/localProject/LocalFunctionTreeItem";
import { type LocalProjectTreeItem } from "../../tree/localProject/LocalProjectTreeItem";
import { createActivityContext } from "../../utils/activityUtils";
import { nonNullValue } from "../../utils/nonNull";
import { getContainingWorkspace } from "../../utils/workspace";
import { getWorkspaceSetting } from "../../vsCodeConfig/settings";
import { verifyInitForVSCode } from "../../vsCodeConfig/verifyInitForVSCode";
import { tryGetFunctionProjectRoot } from "../createNewProject/verifyIsProject";
import { type IBindingWizardContext } from "./IBindingWizardContext";
import { createBindingWizard } from "./createBindingWizard";

export async function addBinding(context: IActionContext, data: Uri | LocalFunctionTreeItem | undefined): Promise<void> {
    let functionJsonPath: string;
    let workspaceFolder: WorkspaceFolder;
    let workspacePath: string;
    let projectPath: string | undefined;
    let language: ProjectLanguage;
    let version: FuncVersion;

    if (data instanceof Uri) {
        functionJsonPath = data.fsPath;
        workspaceFolder = nonNullValue(getContainingWorkspace(functionJsonPath), 'workspaceFolder');
        workspacePath = workspaceFolder.uri.fsPath;
        projectPath = await tryGetFunctionProjectRoot(context, workspaceFolder, 'modalPrompt') || workspacePath;
        const verifiedInit = await verifyInitForVSCode(context, projectPath);
        language = verifiedInit.language;
        version = verifiedInit.version;
    } else {
        if (!data) {
            const noItemFoundErrorMessage: string = localize('noLocalProject', 'No matching functions found. C# and Java projects do not support this operation.');
            data = await ext.rgApi.workspaceResourceTree.showTreeItemPicker<LocalFunctionTreeItem>(/Local;ReadWrite;Function;/i, { ...context, noItemFoundErrorMessage });
        }

        if (!data.functionJsonPath) {
            throw new Error(localize('addBindingNotSupported', 'Add binding is not supported for this project type.'));
        }
        functionJsonPath = data.functionJsonPath;

        const projectTi: LocalProjectTreeItem = data.parent.parent;
        workspaceFolder = projectTi.workspaceFolder;
        workspacePath = projectTi.workspacePath;
        projectPath = projectTi.effectiveProjectPath;
        language = projectTi.language;
        version = projectTi.version;
    }

    const projectTemplateKey: string | undefined = getWorkspaceSetting(projectTemplateKeySetting, projectPath);
    const wizardContext: IBindingWizardContext = Object.assign(context, await createActivityContext(), { functionJsonPath, workspacePath, projectPath, workspaceFolder, language, version, projectTemplateKey });
    const wizard: AzureWizard<IBindingWizardContext> = createBindingWizard(wizardContext);
    await wizard.prompt();
    await wizard.execute();
}
