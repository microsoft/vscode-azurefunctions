/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as FunctionsCli from '../functions-cli';
import * as TemplateFiles from '../template-files';
import * as util from '../util';

export async function createFunctionApp(outputChannel: vscode.OutputChannel): Promise<void> {
    const newFolderId: string = 'newFolder';
    let folderPicks: util.PickWithData<string>[] = [new util.PickWithData(newFolderId, '$(plus) New Folder')];
    const folders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
    if (folders) {
        folderPicks = folderPicks.concat(folders.map((f: vscode.WorkspaceFolder) => new util.PickWithData('', f.uri.fsPath)));
    }
    const folder: util.PickWithData<string> = await util.showQuickPick<string>(folderPicks, 'Select a workspace folder for your new function app');
    const createNewFolder: boolean = folder.data === newFolderId;

    const functionAppPath: string = createNewFolder ? await util.showFolderDialog() : folder.label;

    const tasksJsonPath: string = path.join(functionAppPath, '.vscode', 'tasks.json');
    const tasksJsonExists: boolean = fs.existsSync(tasksJsonPath);
    const launchJsonPath: string = path.join(functionAppPath, '.vscode', 'launch.json');
    const launchJsonExists: boolean = fs.existsSync(launchJsonPath);

    await FunctionsCli.createFunctionApp(outputChannel, functionAppPath);

    if (!tasksJsonExists && !launchJsonExists) {
        await util.writeToFile(tasksJsonPath, TemplateFiles.getTasksJson());
        await util.writeToFile(launchJsonPath, TemplateFiles.getLaunchJson());
    }

    if (createNewFolder) {
        // If we created a new folder, open it now. NOTE: This will restart the extension host
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(functionAppPath), false);
    }
}
