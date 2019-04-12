/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { DialogResponses } from 'vscode-azureextensionui';
import { deploySubpathSetting, extensionPrefix } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { getFuncExtensionSetting, updateGlobalSetting } from '../../ProjectSettings';
import { SlotTreeItemBase } from '../../tree/SlotTreeItemBase';
import { isPathEqual, isSubpath } from '../../utils/fs';
import * as workspaceUtil from '../../utils/workspace';

export async function getDeployFsPath(target: vscode.Uri | string | SlotTreeItemBase | undefined): Promise<string> {
    if (target instanceof vscode.Uri) {
        return await appendDeploySubpathSetting(target.fsPath);
    } else if (typeof target === 'string') {
        return await appendDeploySubpathSetting(target);
    } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 1) {
        // If there is only one workspace and it has 'deploySubPath' set - return that value without prompting
        const folderPath: string = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const deploySubpath: string | undefined = getFuncExtensionSetting(deploySubpathSetting, folderPath);
        if (deploySubpath) {
            return path.join(folderPath, deploySubpath);
        }
    }

    const workspaceMessage: string = localize('selectZipDeployFolder', 'Select the folder to zip and deploy');
    return await workspaceUtil.selectWorkspaceFolder(ext.ui, workspaceMessage, f => getFuncExtensionSetting(deploySubpathSetting, f.uri.fsPath));
}

/**
 * Appends the deploySubpath setting if the target path matches the root of a workspace folder
 * If the targetPath is a sub folder instead of the root, leave the targetPath as-is and assume they want that exact folder used
 */
async function appendDeploySubpathSetting(targetPath: string): Promise<string> {
    if (vscode.workspace.workspaceFolders) {
        const deploySubPath: string | undefined = getFuncExtensionSetting(deploySubpathSetting, targetPath);
        if (deploySubPath) {
            if (vscode.workspace.workspaceFolders.some(f => isPathEqual(f.uri.fsPath, targetPath))) {
                return path.join(targetPath, deploySubPath);
            } else {
                const folder: vscode.WorkspaceFolder | undefined = vscode.workspace.workspaceFolders.find(f => isSubpath(f.uri.fsPath, targetPath));
                if (folder) {
                    const fsPathWithSetting: string = path.join(folder.uri.fsPath, deploySubPath);
                    if (!isPathEqual(fsPathWithSetting, targetPath)) {
                        const settingKey: string = 'showDeploySubpathWarning';
                        if (getFuncExtensionSetting(settingKey)) {
                            const selectedFolder: string = path.relative(folder.uri.fsPath, targetPath);
                            const message: string = localize('mismatchDeployPath', 'Deploying "{0}" instead of selected folder "{1}". Use "{2}.{3}" to change this behavior.', deploySubPath, selectedFolder, extensionPrefix, deploySubpathSetting);
                            // don't wait
                            // tslint:disable-next-line:no-floating-promises
                            ext.ui.showWarningMessage(message, { title: localize('ok', 'OK') }, DialogResponses.dontWarnAgain).then(async (result: vscode.MessageItem) => {
                                if (result === DialogResponses.dontWarnAgain) {
                                    await updateGlobalSetting(settingKey, false);
                                }
                            });
                        }
                    }

                    return fsPathWithSetting;
                }
            }
        }
    }

    return targetPath;
}
