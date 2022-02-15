/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { getContainingWorkspace, selectWorkspaceFolder } from '../../utils/workspace';
import { IProjectWizardContext } from './IProjectWizardContext';

export class FolderListStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;

    public static setProjectPath(context: Partial<IProjectWizardContext>, projectPath: string): void {
        context.projectPath = projectPath;
        context.workspaceFolder = getContainingWorkspace(projectPath);
        context.workspacePath = (context.workspaceFolder && context.workspaceFolder.uri.fsPath) || projectPath;
        if (context.workspaceFolder) {
            context.openBehavior = 'AlreadyOpen';
        }
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        const placeHolder: string = localize('selectNewProjectFolder', 'Select the folder that will contain your function project');
        FolderListStep.setProjectPath(context, await selectWorkspaceFolder(context, placeHolder));
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return !context.projectPath;
    }
}
