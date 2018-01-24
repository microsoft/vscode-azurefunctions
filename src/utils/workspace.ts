/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { IUserInterface, PickWithData } from '../IUserInterface';
import { localize } from '../localize';
import * as fsUtils from './fs';

export async function selectWorkspaceFolder(ui: IUserInterface, placeholder: string, subpath?: string): Promise<string> {
    const browse: string = ':browse';
    let folder: PickWithData<string> | undefined;
    if (vscode.workspace.workspaceFolders) {
        const folderPicks: PickWithData<string>[] = vscode.workspace.workspaceFolders.map((f: vscode.WorkspaceFolder) => {
            const fsPath: string = subpath ? path.join(f.uri.fsPath, subpath) : f.uri.fsPath;
            return new PickWithData('', fsPath);
        });
        folderPicks.push(new PickWithData(browse, localize('azFunc.browse', '$(file-directory) Browse...')));
        folder = await ui.showQuickPick<string>(folderPicks, placeholder);
    }

    return folder && folder.data !== browse ? folder.label : await ui.showFolderDialog();
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
