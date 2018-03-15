/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { IAzureUserInput } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { getFuncExtensionSetting } from '../ProjectSettings';
import * as fsUtils from './fs';

export async function selectWorkspaceFolder(ui: IAzureUserInput, placeHolder: string, subpathSettingKey?: string): Promise<string> {
    let folder: vscode.QuickPickItem | undefined;
    if (vscode.workspace.workspaceFolders) {
        const folderPicks: vscode.QuickPickItem[] = vscode.workspace.workspaceFolders.map((f: vscode.WorkspaceFolder) => {
            let subpath: string | undefined;
            if (subpathSettingKey) {
                subpath = getFuncExtensionSetting(subpathSettingKey, f.uri.fsPath);
            }

            const fsPath: string = subpath ? path.join(f.uri.fsPath, subpath) : f.uri.fsPath;
            return { label: path.basename(fsPath), description: fsPath };
        });

        folderPicks.push({ label: localize('azFunc.browse', '$(file-directory) Browse...'), description: '' });
        folder = await ui.showQuickPick(folderPicks, { placeHolder });
    }

    return folder && folder.description ? folder.description : (await ui.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined,
        openLabel: localize('select', 'Select')
    }))[0].fsPath;
}

export function isFolderOpenInWorkspace(fsPath: string): boolean {
    if (vscode.workspace.workspaceFolders) {
        const folder: vscode.WorkspaceFolder | undefined = vscode.workspace.workspaceFolders.find((f: vscode.WorkspaceFolder): boolean => {
            return fsUtils.isPathEqual(f.uri.fsPath, fsPath) || fsUtils.isSubpath(f.uri.fsPath, fsPath);
        });

        return folder !== undefined;
    } else {
        return false;
    }
}
