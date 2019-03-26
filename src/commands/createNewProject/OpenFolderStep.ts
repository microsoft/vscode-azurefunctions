/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Uri, workspace, WorkspaceFolder } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { IProjectWizardContext } from './IProjectWizardContext';

export class OpenFolderStep extends AzureWizardExecuteStep<IProjectWizardContext> {
    public async execute(wizardContext: IProjectWizardContext): Promise<void> {
        // tslint:disable-next-line:strict-boolean-expressions
        const openFolders: WorkspaceFolder[] = workspace.workspaceFolders || [];
        if (wizardContext.openBehavior === 'AddToWorkspace' && openFolders.length === 0) {
            // no point in adding to an empty workspace
            wizardContext.openBehavior = 'OpenInCurrentWindow';
        }

        const uri: Uri = Uri.file(wizardContext.workspacePath);
        if (wizardContext.openBehavior === 'AddToWorkspace') {
            workspace.updateWorkspaceFolders(openFolders.length, 0, { uri: uri });
        } else {
            await commands.executeCommand('vscode.openFolder', uri, wizardContext.openBehavior === 'OpenInNewWindow' /* forceNewWindow */);
        }
    }

    public shouldExecute(wizardContext: IProjectWizardContext): boolean {
        return !!wizardContext.openBehavior && wizardContext.openBehavior !== 'AlreadyOpen' && wizardContext.openBehavior !== 'DontOpen';
    }
}
