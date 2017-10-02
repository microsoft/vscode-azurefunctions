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
import { localize } from '../util';

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
        return localize('azFunc.emptyTemplateNameError', 'The template name cannot be empty.');
    } else if (fs.existsSync(path.join(rootPath, name))) {
        return localize('azFunc.existingFolderError', 'A folder with the name \'{0}\' already exists.', name);
    } else {
        return undefined;
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
        const folder: util.Pick = await util.showQuickPick(folderPicks, localize('azFunc.newFuncSelectFolder', 'Select a workspace folder for your new function'));
        functionAppPath = folder.label;
    }

    const missingFiles: string[] = getMissingFunctionAppFiles(functionAppPath);
    if (missingFiles.length !== 0) {
        const yes: string = localize('azFunc.yes', 'Yes');
        const no: string = localize('azFunc.no', 'No');
        const message: string = localize('azFunc.missingFuncAppFiles', 'The current folder is missing the following function app files: \'{0}\'. Add the missing files?', missingFiles.join(','));
        const result: string | undefined = await vscode.window.showWarningMessage(message, yes, no);
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
    const template: util.Pick = await util.showQuickPick(templates, localize('azFunc.selectFuncTemplate', 'Select a function template'));

    const placeHolder: string = localize('azFunc.funcNamePlaceholder', 'Function Name');
    const prompt: string = localize('azFunc.funcNamePrompt', 'Provide a function name');
    const name: string = await util.showInputBox(placeHolder, prompt, false, (s: string) => validateTemplateName(functionAppPath, s));

    await FunctionsCli.createFunction(outputChannel, functionAppPath, template.label, name);
    const newFileUri: vscode.Uri = vscode.Uri.file(path.join(functionAppPath, name, 'index.js'));
    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(newFileUri));
}
