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
import * as uiUtil from '../utils/ui';

export async function createNewProject(outputChannel: vscode.OutputChannel): Promise<void> {
    const newFolderId: string = 'newFolder';
    let folderPicks: uiUtil.PickWithData<string>[] = [new uiUtil.PickWithData(newFolderId, localize('azFunc.newFolder', '$(plus) New Folder'))];
    const folders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
    if (folders) {
        folderPicks = folderPicks.concat(folders.map((f: vscode.WorkspaceFolder) => new uiUtil.PickWithData('', f.uri.fsPath)));
    }
    const folder: uiUtil.PickWithData<string> = await uiUtil.showQuickPick<string>(folderPicks, localize('azFunc.newFuncAppSelectFolder', 'Select a workspace folder for your new function app'));
    const createNewFolder: boolean = folder.data === newFolderId;

    const functionAppPath: string = createNewFolder ? await uiUtil.showFolderDialog() : folder.label;

    const tasksJsonPath: string = path.join(functionAppPath, '.vscode', 'tasks.json');
    const tasksJsonExists: boolean = fs.existsSync(tasksJsonPath);
    const launchJsonPath: string = path.join(functionAppPath, '.vscode', 'launch.json');
    const launchJsonExists: boolean = fs.existsSync(launchJsonPath);

    await FunctionsCli.createNewProject(outputChannel, functionAppPath);

    if (!tasksJsonExists && !launchJsonExists) {
        await fsUtil.writeToFile(tasksJsonPath, TemplateFiles.getTasksJson());
        await fsUtil.writeToFile(launchJsonPath, TemplateFiles.getLaunchJson());
    }

    if (createNewFolder) {
        // If we created a new folder, open it now. NOTE: This will restart the extension host
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(functionAppPath), false);
    }
}
