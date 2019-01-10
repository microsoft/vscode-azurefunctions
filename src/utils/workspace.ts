/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { isBoolean } from 'util';
import * as vscode from 'vscode';
import { IActionContext, IAzureQuickPickItem, IAzureQuickPickOptions, IAzureUserInput, UserCancelledError } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getFuncExtensionSetting, updateGlobalSetting } from '../ProjectSettings';
import * as fsUtils from './fs';

export async function selectWorkspaceFolder(ui: IAzureUserInput, placeHolder: string, getSubPath?: (f: vscode.WorkspaceFolder) => string | undefined): Promise<string> {
    return await selectWorkspaceItem(
        ui,
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

export async function selectWorkspaceFile(ui: IAzureUserInput, placeHolder: string, getSubPath?: (f: vscode.WorkspaceFolder) => string | undefined): Promise<string> {
    let defaultUri: vscode.Uri | undefined;
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 && getSubPath) {
        const firstFolder: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders[0];
        const subPath: string | undefined = getSubPath(firstFolder);
        if (subPath) {
            defaultUri = vscode.Uri.file(path.join(firstFolder.uri.fsPath, subPath));
        }
    }

    return await selectWorkspaceItem(
        ui,
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

export async function selectWorkspaceItem(ui: IAzureUserInput, placeHolder: string, options: vscode.OpenDialogOptions, getSubPath?: (f: vscode.WorkspaceFolder) => string | undefined): Promise<string> {
    let folder: IAzureQuickPickItem<string | undefined> | undefined;
    if (vscode.workspace.workspaceFolders) {
        const folderPicks: IAzureQuickPickItem<string | undefined>[] = vscode.workspace.workspaceFolders.map((f: vscode.WorkspaceFolder) => {
            let subpath: string | undefined;
            if (getSubPath) {
                subpath = getSubPath(f);
            }

            const fsPath: string = subpath ? path.join(f.uri.fsPath, subpath) : f.uri.fsPath;
            return { label: path.basename(fsPath), description: fsPath, data: fsPath };
        });

        folderPicks.push({ label: localize('azFunc.browse', '$(file-directory) Browse...'), description: '', data: undefined });
        folder = await ui.showQuickPick(folderPicks, { placeHolder });
    }

    return folder && folder.data ? folder.data : (await ui.showOpenDialog(options))[0].fsPath;
}

enum OpenBehavior {
    AddToWorkspace = 'AddToWorkspace',
    OpenInNewWindow = 'OpenInNewWindow',
    OpenInCurrentWindow = 'OpenInCurrentWindow'
}

const projectOpenBehaviorSetting: string = 'projectOpenBehavior';

/**
 * If the selected folder is not open in a workspace, open it now. NOTE: This may restart the extension host
 */
export async function ensureFolderIsOpen(fsPath: string, actionContext: IActionContext, message?: string, allowSubFolder: boolean = false): Promise<string> {
    // tslint:disable-next-line:strict-boolean-expressions
    const openFolders: vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders || [];
    const folder: vscode.WorkspaceFolder | undefined = openFolders.find((f: vscode.WorkspaceFolder): boolean => {
        return fsUtils.isPathEqual(f.uri.fsPath, fsPath) || (allowSubFolder && fsUtils.isSubpath(f.uri.fsPath, fsPath));
    });

    if (folder) {
        actionContext.properties.openBehavior = 'AlreadyOpen';
        return folder.uri.fsPath;
    } else {
        if (message) {
            const open: vscode.MessageItem = { title: localize('open', 'Open Folder') };
            // No need to check result. Open/Cancel are the only possibilities and Cancel will throw a UserCancelledError
            await ext.ui.showWarningMessage(message, { modal: true }, open);
        }

        actionContext.properties.openBehaviorFromSetting = 'false';
        const setting: string | undefined = getFuncExtensionSetting(projectOpenBehaviorSetting);
        let openBehavior: OpenBehavior | undefined;
        if (setting) {
            for (const key of Object.keys(OpenBehavior)) {
                const value: OpenBehavior = <OpenBehavior>OpenBehavior[key];
                if (value.toLowerCase() === setting.toLowerCase()) {
                    openBehavior = value;
                    actionContext.properties.openBehaviorFromSetting = 'true';
                    break;
                }
            }
        }

        const notAlwaysPick: IAzureQuickPickItem<OpenBehavior | boolean> = { label: localize('notAlways', '$(circle-slash) Always use this choice'), description: '', data: false, suppressPersistence: true };
        const alwaysPick: IAzureQuickPickItem<OpenBehavior | boolean> = { label: localize('always', '$(check) Always use this choice'), description: '', data: true, suppressPersistence: true };

        const picks: IAzureQuickPickItem<OpenBehavior | boolean>[] = [
            { label: localize('AddToWorkspace', 'Add to workspace'), description: '', data: OpenBehavior.AddToWorkspace },
            { label: localize('OpenInNewWindow', 'Open in new window'), description: '', data: OpenBehavior.OpenInNewWindow },
            { label: localize('OpenInCurrentWindow', 'Open in current window'), description: '', data: OpenBehavior.OpenInCurrentWindow },
            notAlwaysPick
        ];

        const options: IAzureQuickPickOptions = { placeHolder: localize('selectOpenBehavior', 'Select how you would like to open your project'), suppressPersistence: true };

        let result: OpenBehavior | boolean;
        let alwaysUseThisChoice: boolean = false;
        while (openBehavior === undefined) {
            result = (await ext.ui.showQuickPick(picks, options)).data;
            if (isBoolean(result)) {
                alwaysUseThisChoice = !result; // The new value is the opposite of what the user just clicked in the quick pick
                picks.pop();
                picks.push(alwaysUseThisChoice ? alwaysPick : notAlwaysPick);
            } else {
                openBehavior = result;
            }
        }

        actionContext.properties.openBehavior = openBehavior;

        if (alwaysUseThisChoice) {
            await updateGlobalSetting(projectOpenBehaviorSetting, openBehavior);
        }

        if (openBehavior === OpenBehavior.AddToWorkspace && !openFolders.length) {
            openBehavior = OpenBehavior.OpenInCurrentWindow;
        }

        const uri: vscode.Uri = vscode.Uri.file(fsPath);
        if (openBehavior === OpenBehavior.AddToWorkspace) {
            vscode.workspace.updateWorkspaceFolders(openFolders.length, 0, { uri: uri });
        } else {
            await vscode.commands.executeCommand('vscode.openFolder', uri, openBehavior === OpenBehavior.OpenInNewWindow /* forceNewWindow */);
            if (openBehavior === OpenBehavior.OpenInNewWindow) {
                // extension host will not be restarted since a new instance of VS Code is opened, but we don't want deploy to continue
                throw new UserCancelledError();
            }
        }
        return uri.fsPath;
    }
}
