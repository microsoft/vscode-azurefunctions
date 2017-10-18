/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as FunctionsCli from '../functions-cli';
import { localize } from '../localize';
import * as TemplateFiles from '../template-files';
import * as fsUtil from '../utils/fs';
import * as workspaceUtil from '../utils/workspace';

export async function createNewProject(outputChannel: vscode.OutputChannel): Promise<void> {
    const functionAppPath: string = await workspaceUtil.selectWorkspaceFolder(localize('azFunc.selectFunctionAppFolderNew', 'Select the folder that will contain your function app'));

    const tasksJsonPath: string = path.join(functionAppPath, '.vscode', 'tasks.json');
    const tasksJsonExists: boolean = fs.existsSync(tasksJsonPath);
    const launchJsonPath: string = path.join(functionAppPath, '.vscode', 'launch.json');
    const launchJsonExists: boolean = fs.existsSync(launchJsonPath);

    await FunctionsCli.createNewProject(outputChannel, functionAppPath);

    if (!tasksJsonExists && !launchJsonExists) {
        await fsUtil.writeToFile(tasksJsonPath, TemplateFiles.getTasksJson());
        await fsUtil.writeToFile(launchJsonPath, TemplateFiles.getLaunchJson());
    }

    if (!workspaceUtil.isFolderOpenInWorkspace(functionAppPath)) {
        // If the selected folder is not open in a workspace, open it now. NOTE: This may restart the extension host
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(functionAppPath), false);
    }
}
