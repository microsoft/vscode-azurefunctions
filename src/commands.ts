/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as opn from 'opn';
import * as path from 'path';
import * as vscode from 'vscode';
import * as FunctionsCli from './functions-cli';
import { FunctionAppNode, INode } from './nodes';
import * as TemplateFiles from './template-files';
import * as util from './util';

const expectedFunctionAppFiles = [
    'host.json',
    'local.settings.json',
    path.join('.vscode', 'launch.json')
];

export function openInPortal(node?: INode) {
    if (node && node.tenantId) {
        opn(`https://portal.azure.com/${node.tenantId}/#resource${node.id}`);
    }
}

export async function createFunction(outputChannel: vscode.OutputChannel) {
    let functionAppPath: string;
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new util.NoWorkspaceError();
    } else if (folders.length === 1) {
        functionAppPath = folders[0].uri.fsPath;
    } else {
        const folderPicks = folders.map(f => new util.QuickPickItem(f.uri.fsPath));
        const folder = await util.showQuickPick(folderPicks, 'Select a workspace folder for your new function');
        functionAppPath = folder.label;
    }

    const missingFiles = getMissingFunctionAppFiles(functionAppPath);
    if (missingFiles.length !== 0) {
        const yes = 'Yes';
        const result = await vscode.window.showWarningMessage(`The current folder is missing the following function app files: '${missingFiles.join('\', \'')}'. Add the missing files?`, yes, 'No');
        if (result === yes) {
            await FunctionsCli.createFunctionApp(outputChannel, functionAppPath);
        } else {
            throw new util.UserCancelledError();
        }
    }

    const templates = [
        new util.QuickPickItem('BlobTrigger'),
        new util.QuickPickItem('HttpTrigger'),
        new util.QuickPickItem('QueueTrigger'),
        new util.QuickPickItem('TimerTrigger')
    ];
    const template = await util.showQuickPick(templates, 'Select a function template');

    const name = await util.showInputBox('Function Name', 'Provide a function name', false, (s) => validateTemplateName(functionAppPath, s));

    await FunctionsCli.createFunction(outputChannel, functionAppPath, template.label, name);
    const newFileUri = vscode.Uri.file(path.join(functionAppPath, name, 'index.js'));
    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(newFileUri));
}

export async function createFunctionApp(outputChannel: vscode.OutputChannel) {
    const newFolderId = 'newFolder';
    let folderPicks = [new util.QuickPickItemWithData(newFolderId, '$(plus) New Folder')];
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        folderPicks = folderPicks.concat(folders.map(f => new util.QuickPickItemWithData('', f.uri.fsPath)));
    }
    const folder = await util.showQuickPick<string>(folderPicks, 'Select a workspace folder for your new function app');
    const createNewFolder = folder.data === newFolderId;

    const functionAppPath = createNewFolder ? await util.showFolderDialog() : folder.label;

    const tasksJsonPath = path.join(functionAppPath, '.vscode', 'tasks.json');
    const tasksJsonExists = await fs.existsSync(tasksJsonPath);
    const launchJsonPath = path.join(functionAppPath, '.vscode', 'launch.json');
    const launchJsonExists = await fs.existsSync(launchJsonPath);

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

export async function startFunctionApp(outputChannel: vscode.OutputChannel, node?: FunctionAppNode) {
    if (node) {
        outputChannel.appendLine(`Starting Function App "${node.label}"...`);
        await node.start();
        outputChannel.appendLine(`Function App "${node.label}" has been started.`);
    }
}

export async function stopFunctionApp(outputChannel: vscode.OutputChannel, node?: FunctionAppNode) {
    if (node) {
        outputChannel.appendLine(`Stopping Function App "${node.label}"...`);
        await node.stop();
        outputChannel.appendLine(`Function App "${node.label}" has been stopped.`);
    }
}

export async function restartFunctionApp(outputChannel: vscode.OutputChannel, node?: FunctionAppNode) {
    if (node) {
        outputChannel.appendLine(`Restarting Function App "${node.label}"...`);
        await node.restart();
        outputChannel.appendLine(`Function App "${node.label}" has been restarted.`);
    }
}

function getMissingFunctionAppFiles(rootPath: string) {
    return expectedFunctionAppFiles.filter(file => !fs.existsSync(path.join(rootPath, file)));
}

function validateTemplateName(rootPath: string, name: string): string | undefined {
    if (!name) {
        return 'The template name cannot be empty.';
    } else if (fs.existsSync(path.join(rootPath, name))) {
        return `A folder with the name "${name}" already exists.`;
    }
}
