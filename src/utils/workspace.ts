/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { IUserInterface, PickWithData } from '../IUserInterface';
import { localize } from '../localize';
import { TemplateLanguage } from '../templates/Template';

export async function selectWorkspaceFolder(ui: IUserInterface, placeholder: string): Promise<string> {
    const browse: string = ':browse';
    let folder: PickWithData<string> | undefined;
    if (vscode.workspace.workspaceFolders) {
        let folderPicks: PickWithData<string>[] = [new PickWithData(browse, localize('azFunc.browse', '$(file-directory) Browse...'))];
        folderPicks = folderPicks.concat(vscode.workspace.workspaceFolders.map((f: vscode.WorkspaceFolder) => new PickWithData('', f.uri.fsPath)));

        folder = await ui.showQuickPick<string>(folderPicks, placeholder);
    }

    return folder && folder.data !== browse ? folder.label : await ui.showFolderDialog();
}

export function isFolderOpenInWorkspace(fsPath: string): boolean {
    if (vscode.workspace.workspaceFolders) {

        const folder: vscode.WorkspaceFolder | undefined = vscode.workspace.workspaceFolders.find((f: vscode.WorkspaceFolder): boolean => {
            return path.relative(fsPath, f.uri.fsPath) === '';
        });

        return folder !== undefined;
    } else {
        return false;
    }
}

export function getProjectType(projectPath: string): string {
    let language: string = TemplateLanguage.JavaScript;
    fse.readdirSync(projectPath).forEach((file: string) => {
        const stat: fse.Stats = fse.statSync(path.join(projectPath, file));
        // Currently checking the existing pom.xml to determine whether the function project is Java language based.
        if (stat.isFile() && file === 'pom.xml') {
            language = TemplateLanguage.Java;
        }
    });
    return language;
}
