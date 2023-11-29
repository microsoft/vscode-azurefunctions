/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type WorkspaceFolder } from "vscode";
import { localSettingsFileName } from '../../../constants';
import { getRootWorkspaceFolder, selectWorkspaceFile } from '../../../utils/workspace';
import { tryGetFunctionProjectRoot } from '../../createNewProject/verifyIsProject';

/**
 * If only one project is open and the default local settings file exists, return that.
 * Otherwise, prompt
 */
export async function getLocalSettingsFile(context: IActionContext, message: string, workspaceFolder?: WorkspaceFolder): Promise<string> {
    workspaceFolder ||= await getRootWorkspaceFolder();
    if (workspaceFolder) {
        const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, workspaceFolder);
        if (projectPath) {
            const localSettingsFile: string = path.join(projectPath, localSettingsFileName);
            if (await AzExtFsExtra.pathExists(localSettingsFile)) {
                return localSettingsFile;
            }
        }
    }

    return await selectWorkspaceFile(context, message, async (f: WorkspaceFolder): Promise<string> => {
        const projectPath: string = await tryGetFunctionProjectRoot(context, f) || f.uri.fsPath;
        return path.relative(f.uri.fsPath, path.join(projectPath, localSettingsFileName));
    });
}
