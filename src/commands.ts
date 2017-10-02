/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as opn from 'opn';
import * as path from 'path';
import * as vscode from 'vscode';
import * as errors from './errors';
import * as FunctionsCli from './functions-cli';
import { FunctionAppNode, INode } from './nodes';
import * as TemplateFiles from './template-files';
import * as util from './util';

const expectedFunctionAppFiles: string[] = [
    'host.json',
    'local.settings.json',
    path.join('.vscode', 'launch.json')
];

export function openInPortal(node?: INode): void {
    if (node && node.tenantId) {
        (<(s: string) => void>opn)(`https://portal.azure.com/${node.tenantId}/#resource${node.id}`);
    }
}

export async function createFunction(outputChannel: vscode.OutputChannel): Promise<void> {
    let functionAppPath: string;
    const folders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new errors.NoWorkspaceError();
    } else if (folders.length === 1) {
        functionAppPath = folders[0].uri.fsPath;
    } else {
        const folderPicks: util.GenericQuickPickItem[] = folders.map((f: vscode.WorkspaceFolder) => new util.GenericQuickPickItem(f.uri.fsPath));
        const folder: util.GenericQuickPickItem = await util.showQuickPick(folderPicks, 'Select a workspace folder for your new function');
        functionAppPath = folder.label;
    }

    const missingFiles: string[] = getMissingFunctionAppFiles(functionAppPath);
    if (missingFiles.length !== 0) {
        const yes: string = 'Yes';
        const result: string | undefined = await vscode.window.showWarningMessage(`The current folder is missing the following function app files: '${missingFiles.join('\', \'')}'. Add the missing files?`, yes, 'No');
        if (result === yes) {
            await FunctionsCli.createFunctionApp(outputChannel, functionAppPath);
        } else {
            throw new errors.UserCancelledError();
        }
    }

    const templates: util.GenericQuickPickItem[] = [
        new util.GenericQuickPickItem('BlobTrigger'),
        new util.GenericQuickPickItem('HttpTrigger'),
        new util.GenericQuickPickItem('QueueTrigger'),
        new util.GenericQuickPickItem('TimerTrigger')
    ];
    const template: util.GenericQuickPickItem = await util.showQuickPick(templates, 'Select a function template');

    const name: string = await util.showInputBox('Function Name', 'Provide a function name', false, (s: string) => validateTemplateName(functionAppPath, s));

    await FunctionsCli.createFunction(outputChannel, functionAppPath, template.label, name);
    const newFileUri: vscode.Uri = vscode.Uri.file(path.join(functionAppPath, name, 'index.js'));
    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(newFileUri));
}

export async function createFunctionApp(outputChannel: vscode.OutputChannel): Promise<void> {
    const newFolderId: string = 'newFolder';
    let folderPicks: util.QuickPickItemWithData<string>[] = [new util.QuickPickItemWithData(newFolderId, '$(plus) New Folder')];
    const folders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
    if (folders) {
        folderPicks = folderPicks.concat(folders.map((f: vscode.WorkspaceFolder) => new util.QuickPickItemWithData('', f.uri.fsPath)));
    }
    const folder: util.QuickPickItemWithData<string> = await util.showQuickPick<string>(folderPicks, 'Select a workspace folder for your new function app');
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

export async function startFunctionApp(outputChannel: vscode.OutputChannel, node?: FunctionAppNode): Promise<void> {
    if (node) {
        outputChannel.appendLine(`Starting Function App "${node.label}"...`);
        await node.start();
        outputChannel.appendLine(`Function App "${node.label}" has been started.`);
    }
}

export async function stopFunctionApp(outputChannel: vscode.OutputChannel, node?: FunctionAppNode): Promise<void> {
    if (node) {
        outputChannel.appendLine(`Stopping Function App "${node.label}"...`);
        await node.stop();
        outputChannel.appendLine(`Function App "${node.label}" has been stopped.`);
    }
}

export async function restartFunctionApp(outputChannel: vscode.OutputChannel, node?: FunctionAppNode): Promise<void> {
    if (node) {
        outputChannel.appendLine(`Restarting Function App "${node.label}"...`);
        await node.restart();
        outputChannel.appendLine(`Function App "${node.label}" has been restarted.`);
    }
}

function getMissingFunctionAppFiles(rootPath: string): string[] {
    return expectedFunctionAppFiles.filter((file: string) => !fs.existsSync(path.join(rootPath, file)));
}

function validateTemplateName(rootPath: string, name: string): string | undefined {
    if (!name) {
        return 'The template name cannot be empty.';
    } else if (fs.existsSync(path.join(rootPath, name))) {
        return `A folder with the name "${name}" already exists.`;
    }
}
