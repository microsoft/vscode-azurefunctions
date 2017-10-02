/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as errors from '../errors';
import * as FunctionsCli from '../functions-cli';
import * as util from '../util';

const expectedFunctionAppFiles: string[] = [
    'host.json',
    'local.settings.json',
    path.join('.vscode', 'launch.json')
];

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

export async function createFunction(outputChannel: vscode.OutputChannel): Promise<void> {
    let functionAppPath: string;
    const folders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new errors.NoWorkspaceError();
    } else if (folders.length === 1) {
        functionAppPath = folders[0].uri.fsPath;
    } else {
        const folderPicks: util.Pick[] = folders.map((f: vscode.WorkspaceFolder) => new util.Pick(f.uri.fsPath));
        const folder: util.Pick = await util.showQuickPick(folderPicks, 'Select a workspace folder for your new function');
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

    const templates: util.Pick[] = [
        new util.Pick('BlobTrigger'),
        new util.Pick('HttpTrigger'),
        new util.Pick('QueueTrigger'),
        new util.Pick('TimerTrigger')
    ];
    const template: util.Pick = await util.showQuickPick(templates, 'Select a function template');

    const name: string = await util.showInputBox('Function Name', 'Provide a function name', false, (s: string) => validateTemplateName(functionAppPath, s));

    await FunctionsCli.createFunction(outputChannel, functionAppPath, template.label, name);
    const newFileUri: vscode.Uri = vscode.Uri.file(path.join(functionAppPath, name, 'index.js'));
    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(newFileUri));
}
