/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { Uri, ViewColumn, window, workspace } from 'vscode';
import { type MCPProjectWizardContext } from '../IProjectWizardContext';

export class MCPOpenFileStep extends AzureWizardExecuteStep<MCPProjectWizardContext> {
    public priority: number = 240; // Execute before OpenFolderStep (priority 250) but after other project setup

    public async execute(context: MCPProjectWizardContext): Promise<void> {
        const mcpJsonFilePath: string = path.join(context.projectPath, '.vscode', 'mcp.json');
        if (await AzExtFsExtra.pathExists(mcpJsonFilePath)) {
            const mcpJsonFile = await workspace.openTextDocument(Uri.file(mcpJsonFilePath));
            await window.showTextDocument(mcpJsonFile, { preview: false });
        }

        // Open sample tool file in a side-by-side editor
        if (context.sampleToolFilePath) {
            if (await AzExtFsExtra.pathExists(context.sampleToolFilePath)) {
                const doc = await workspace.openTextDocument(Uri.file(context.sampleToolFilePath));
                await window.showTextDocument(doc, { preview: false, viewColumn: ViewColumn.Beside });
            }
        }
    }

    public shouldExecute(context: MCPProjectWizardContext): boolean {
        // Only execute if we're not opening the folder in a way that would reload the window
        // If opening in current window or new window, the file open would be lost during reload
        const openFolders = workspace.workspaceFolders || [];
        
        // Handle AddToWorkspace: only if there are existing workspace folders
        // (OpenFolderStep changes AddToWorkspace to OpenInCurrentWindow if no folders exist)
        if (context.openBehavior === 'AddToWorkspace') {
            return openFolders.length > 0;
        }
        
        // Always execute for these cases
        return context.openBehavior === 'AlreadyOpen' || 
               context.openBehavior === 'DontOpen';
    }
}
