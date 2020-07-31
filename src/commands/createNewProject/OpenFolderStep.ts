/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Uri, workspace, WorkspaceFolder } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { IProjectWizardContext } from './IProjectWizardContext';

export class OpenFolderStep extends AzureWizardExecuteStep<IProjectWizardContext> {
    public priority: number = 250;

    public async execute(context: IProjectWizardContext): Promise<void> {
        // tslint:disable-next-line:strict-boolean-expressions
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
}
