/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, AzureWizardExecuteStepWithActivityOutput, isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { commands, Uri, workspace, type WorkspaceFolder } from 'vscode';
import { projectOpenBehaviorSetting } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { isPathEqual } from '../../utils/fs';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { cachePostFunctionCreateSteps, runPostFunctionCreateSteps, runPostFunctionCreateStepsFromCache } from '../createFunction/postFunctionCreate';
import { type IProjectWizardContext, type OpenBehavior } from './IProjectWizardContext';
import { OpenBehaviorStep } from './OpenBehaviorStep';

export async function promptAndOpenProject(context: IActionContext, projectPath: string, newFilePath?: string): Promise<void> {
    const createdFunction = newFilePath ? { projectPath, newFilePath, isHttpTrigger: false, isMcpTrigger: false } : undefined;
    if (workspace.workspaceFolders?.some(folder => isPathEqual(folder.uri.fsPath, projectPath))) {
        if (createdFunction) {
            await runPostFunctionCreateSteps(createdFunction);
        }
    } else {
        await promptAndOpenFolder(context, projectPath, createdFunction);
    }
    await ext.rgApi.workspaceResourceTree.refresh(context);
}

async function promptAndOpenFolder(context: IActionContext, projectPath: string, createdFunction?: { projectPath: string; newFilePath: string; isHttpTrigger: boolean; isMcpTrigger: boolean }): Promise<void> {
    const wizardContext: Partial<IProjectWizardContext> & IActionContext = Object.assign({}, context, {
        projectPath, workspacePath: projectPath, workspaceFolder: undefined,
        openBehavior: getWorkspaceSetting<OpenBehavior>(projectOpenBehaviorSetting),
    });
    const openStep = new OpenFolderStep();
    const wizard = new AzureWizard(wizardContext, {
        title: localize('openProject', 'Open new project'),
        promptSteps: [new OpenBehaviorStep()],
        executeSteps: [openStep],
    });
    try {
        await wizard.prompt();
        if (createdFunction && wizardContext.openBehavior &&
            wizardContext.openBehavior !== 'AlreadyOpen' && wizardContext.openBehavior !== 'DontOpen') {
            // A new window may take longer than the classic five-second cache timeout to activate.
            await cachePostFunctionCreateSteps(createdFunction, false);
        }
        await wizard.execute();
        if (createdFunction && wizardContext.openBehavior === 'AddToWorkspace') {
            await runPostFunctionCreateStepsFromCache();
        }
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
            let listener: { dispose(): void } | undefined;
            try {
                await new Promise<void>((resolve, reject) => {
                    listener = workspace.onDidChangeWorkspaceFolders(event => {
                        if (event.added.some(folder => isPathEqual(folder.uri.fsPath, context.workspacePath))) {
                            resolve();
                        }
                    });
                    if (!workspace.updateWorkspaceFolders(openFolders.length, 0, { uri })) {
                        reject(new Error(localize('addProjectToWorkspaceFailed', 'Unable to add the new project to the workspace.')));
                    }
                });
            } finally {
                listener?.dispose();
            }
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
