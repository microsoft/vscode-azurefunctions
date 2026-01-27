/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import type * as vscode from 'vscode';
import { localSettingsFileName } from '../../../constants';
import { getRootWorkspaceFolder, selectWorkspaceFile } from '../../../utils/workspace';
import { tryGetFunctionProjectRoot } from '../../createNewProject/verifyIsProject';

/**
 * If only one project is open and the default local settings file exists, return that.
 * Otherwise, prompt
 */
export async function getLocalSettingsFile(context: IActionContext, message: string, workspaceFolder?: vscode.WorkspaceFolder): Promise<string> {
    workspaceFolder ||= await getRootWorkspaceFolder(context);
    if (workspaceFolder) {
        const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, workspaceFolder);
        if (projectPath) {
            const localSettingsFile: string = path.join(projectPath, localSettingsFileName);
            if (await AzExtFsExtra.pathExists(localSettingsFile)) {
                return localSettingsFile;
            }
        }
    }

    return await selectWorkspaceFile(context, message, async (f: vscode.WorkspaceFolder): Promise<string> => {
        const projectPath: string = await tryGetFunctionProjectRoot(context, f) || f.uri.fsPath;
        return path.relative(f.uri.fsPath, path.join(projectPath, localSettingsFileName));
    });
}

export async function tryGetLocalSettingsFileNoPrompt(context: IActionContext, workspaceFolder: vscode.WorkspaceFolder | string | undefined): Promise<string | undefined> {
    const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, workspaceFolder ?? '');
    if (projectPath) {
        const localSettingsFile: string = path.join(projectPath, localSettingsFileName);
        if (await AzExtFsExtra.pathExists(localSettingsFile)) {
            return localSettingsFile;
        }
    }
    return undefined;
}
