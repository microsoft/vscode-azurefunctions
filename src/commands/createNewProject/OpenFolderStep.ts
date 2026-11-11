/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, AzureWizardExecuteStepWithActivityOutput, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { commands, Uri, workspace, type WorkspaceFolder } from 'vscode';
import { projectOpenBehaviorSetting } from '../../constants';
import { localize } from '../../localize';
import { isPathEqual } from '../../utils/fs';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { type IProjectWizardContext, type OpenBehavior } from './IProjectWizardContext';
import { OpenBehaviorStep } from './OpenBehaviorStep';

export async function promptAndOpenProject(context: IActionContext, projectPath: string): Promise<void> {
    if (workspace.workspaceFolders?.some(folder => isPathEqual(folder.uri.fsPath, projectPath))) {
        return;
    }
    const wizardContext: Partial<IProjectWizardContext> & IActionContext = Object.assign({}, context, {
        projectPath, workspacePath: projectPath, workspaceFolder: undefined,
        openBehavior: getWorkspaceSetting<OpenBehavior>(projectOpenBehaviorSetting),
    });
    const wizard = new AzureWizard(wizardContext, {
        title: localize('openProject', 'Open new project'),
        promptSteps: [new OpenBehaviorStep()],
        executeSteps: [new OpenFolderStep()],
    });
    try {
        await wizard.prompt();
        await wizard.execute();
    } catch (error) {
        // Dismissing the open prompt leaves the successfully created project on disk.
        if (!isUserCancelledError(error)) {
            throw error;
        }
    }
}

export class OpenFolderStep extends AzureWizardExecuteStepWithActivityOutput<IProjectWizardContext> {
    stepName: string;
    public priority: number = 250;

    public async execute(context: IProjectWizardContext): Promise<void> {
        const openFolders: readonly WorkspaceFolder[] = workspace.workspaceFolders || [];
        if (context.openBehavior === 'AddToWorkspace' && openFolders.length === 0) {
            // no point in adding to an empty workspace
            context.openBehavior = 'OpenInCurrentWindow';
        }

        const uri: Uri = Uri.file(context.workspacePath);
        if (context.openBehavior === 'AddToWorkspace') {
            workspace.updateWorkspaceFolders(openFolders.length, 0, { uri: uri });
        } else {
            await commands.executeCommand('vscode.openFolder', uri, context.openBehavior === 'OpenInNewWindow' /* forceNewWindow */);
        }
    }

    public shouldExecute(context: IProjectWizardContext): boolean {
        return !!context.openBehavior && context.openBehavior !== 'AlreadyOpen' && context.openBehavior !== 'DontOpen';
    }

    protected getTreeItemLabel(context: IProjectWizardContext): string {
        return localize('openFolder', 'Open folder "{0}"', context.workspacePath);
    }
    protected getOutputLogSuccess(context: IProjectWizardContext): string {
        return localize('openFolderSuccess', 'Opened folder "{0}"', context.workspacePath);
    }
    protected getOutputLogFail(context: IProjectWizardContext): string {
        return localize('openFolderFail', 'Failed to open folder "{0}"', context.workspacePath);
    }
    protected getOutputLogProgress(context: IProjectWizardContext): string {
        return localize('openingFolder', 'Opening folder "{0}..."', context.workspacePath);
    }
}
