/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError, type IActionContext, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import * as globby from 'globby';
import * as path from 'path';
import * as vscode from 'vscode';
import { localize } from '../localize';
import * as fsUtils from './fs';

export function isMultiRootWorkspace(): boolean {
    return !!vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        && vscode.workspace.name !== vscode.workspace.workspaceFolders[0].name; // multi-root workspaces always have something like "(Workspace)" appended to their name
}

/*
 * Use sparingly. Prefer storing and passing 'projectPaths' instead.
 * Over-reliance on this function may result in excessive prompting when a user employs a multi-root workspace.
 */
export async function getRootWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return undefined;
    } else if (vscode.workspace.workspaceFolders.length === 1) {
        return vscode.workspace.workspaceFolders[0];
    } else {
        const placeHolder: string = localize('selectRootWorkspace', 'Select the folder containing your function project');
        const folder = await vscode.window.showWorkspaceFolderPick({ placeHolder });
        if (!folder) {
            throw new UserCancelledError('selectRootWorkspace');
        }
        return folder;
    }
}

/**
 * Alternative to `vscode.workspace.findFiles` which always returns an empty array if no workspace is open
 */
export async function findFiles(base: vscode.WorkspaceFolder | string, pattern: string): Promise<vscode.Uri[]> {
    // Per globby docs: "Note that glob patterns can only contain forward-slashes, not backward-slashes, so if you want to construct a glob pattern from path components, you need to use path.posix.join() instead of path.join()"
    const posixBase = path.posix.normalize(typeof base === 'string' ? base : base.uri.fsPath).replace(/\\/g, '/');
    const escapedBase = escapeCharacters(posixBase)
    const fullPattern = path.posix.join(escapedBase, pattern);
    return (await globby(fullPattern, { ignore: ['**/node_modules/**'] })).map(s => vscode.Uri.file(s));
}

function escapeCharacters(nonPattern: string): string {
    return nonPattern.replace(/[$^*+?()\[\]\\]/g, '\\$&')
}

export async function selectWorkspaceFolder(context: IActionContext, placeHolder: string, getSubPath?: (f: vscode.WorkspaceFolder) => string | undefined | Promise<string | undefined>): Promise<string> {
    return await selectWorkspaceItem(
        context,
        placeHolder,
        {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 ? vscode.workspace.workspaceFolders[0].uri : undefined,
            openLabel: localize('select', 'Select')
        },
        getSubPath);
}

export async function selectWorkspaceFile(context: IActionContext, placeHolder: string, getSubPath?: (f: vscode.WorkspaceFolder) => string | undefined | Promise<string | undefined>): Promise<string> {
    let defaultUri: vscode.Uri | undefined;
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 && getSubPath) {
        const firstFolder: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders[0];
        const subPath: string | undefined = await getSubPath(firstFolder);
        if (subPath) {
            defaultUri = vscode.Uri.file(path.join(firstFolder.uri.fsPath, subPath));
        }
    }

    return await selectWorkspaceItem(
        context,
        placeHolder,
        {
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            defaultUri: defaultUri,
            openLabel: localize('select', 'Select')
        },
        getSubPath);
}

export async function selectWorkspaceItem(context: IActionContext, placeHolder: string, options: vscode.OpenDialogOptions, getSubPath?: (f: vscode.WorkspaceFolder) => string | undefined | Promise<string | undefined>): Promise<string> {
    let folder: IAzureQuickPickItem<string | undefined> | undefined;
    const folderPicks: IAzureQuickPickItem<string | undefined>[] = [];
    if (vscode.workspace.workspaceFolders) {
        for (const f of vscode.workspace.workspaceFolders) {
            let subpath: string | undefined;
            if (getSubPath) {
                subpath = await getSubPath(f);
            }

            const fsPath: string = subpath ? path.join(f.uri.fsPath, subpath) : f.uri.fsPath;
            if (await AzExtFsExtra.pathExists(fsPath)) {
                folderPicks.push({ label: path.basename(fsPath), description: fsPath, data: fsPath });
            }
        }
        folderPicks.push({ label: localize('browse', '$(file-directory) Browse...'), description: '', data: undefined });
        folder = await context.ui.showQuickPick(folderPicks, { placeHolder });
    }
    return folder && folder.data ? folder.data : (await context.ui.showOpenDialog(options))[0].fsPath;
}

export function getContainingWorkspace(fsPath: string): vscode.WorkspaceFolder | undefined {
    const openFolders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders || [];
    return openFolders.find((f: vscode.WorkspaceFolder): boolean => {
        return fsUtils.isPathEqual(f.uri.fsPath, fsPath) || fsUtils.isSubpath(f.uri.fsPath, fsPath);
    });
}
