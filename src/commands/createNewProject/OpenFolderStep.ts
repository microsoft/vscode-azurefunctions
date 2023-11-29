/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { commands, Uri, workspace, type WorkspaceFolder } from 'vscode';
import { type IProjectWizardContext } from './IProjectWizardContext';

export class OpenFolderStep extends AzureWizardExecuteStep<IProjectWizardContext> {
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
}
