/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { getContainingWorkspace, selectWorkspaceFolder } from '../../utils/workspace';
import { IProjectWizardContext } from './IProjectWizardContext';

export class FolderListStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;

    public static setProjectPath(wizardContext: Partial<IProjectWizardContext>, projectPath: string): void {
        wizardContext.projectPath = projectPath;
        wizardContext.workspaceFolder = getContainingWorkspace(projectPath);
        wizardContext.workspacePath = (wizardContext.workspaceFolder && wizardContext.workspaceFolder.uri.fsPath) || projectPath;
        if (wizardContext.workspaceFolder) {
            wizardContext.openBehavior = 'AlreadyOpen';
        }
    }

    public async prompt(wizardContext: IProjectWizardContext): Promise<void> {
        const placeHolder: string = localize('selectNewProjectFolder', 'Select the folder that will contain your function project');
        FolderListStep.setProjectPath(wizardContext, await selectWorkspaceFolder(ext.ui, placeHolder));
    }

    public shouldPrompt(wizardContext: IProjectWizardContext): boolean {
        return !wizardContext.projectPath;
    }
}
