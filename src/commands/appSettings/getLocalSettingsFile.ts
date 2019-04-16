/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { workspace, WorkspaceFolder } from "vscode";
import { localSettingsFileName } from "../../constants";
import { ext } from "../../extensionVariables";
import { selectWorkspaceFile } from "../../utils/workspace";
import { tryGetFunctionProjectRoot } from "../createNewProject/verifyIsProject";

/**
 * If only one project is open and the default local settings file exists, return that.
 * Otherwise, prompt
 */
export async function getLocalSettingsFile(message: string, workspacePath?: string): Promise<string> {
    // tslint:disable-next-line: strict-boolean-expressions
    const folders: WorkspaceFolder[] = workspace.workspaceFolders || [];
    if (workspacePath || folders.length === 1) {
        workspacePath = workspacePath || folders[0].uri.fsPath;
        const projectPath: string | undefined = await tryGetFunctionProjectRoot(workspacePath, true /* suppressPrompt */);
        if (projectPath) {
            const localSettingsFile: string = path.join(projectPath, localSettingsFileName);
            if (await fse.pathExists(localSettingsFile)) {
                return localSettingsFile;
            }
        }
    }

    return await selectWorkspaceFile(ext.ui, message, async (f: WorkspaceFolder): Promise<string> => {
        workspacePath = f.uri.fsPath;
        const projectPath: string = await tryGetFunctionProjectRoot(workspacePath, true /* suppressPrompt */) || workspacePath;
        return path.relative(workspacePath, path.join(projectPath, localSettingsFileName));
    });
}
