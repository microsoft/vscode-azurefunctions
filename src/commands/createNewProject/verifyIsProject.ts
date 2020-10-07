/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { MessageItem } from 'vscode';
import { DialogResponses, IActionContext, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { hostFileName, projectSubpathSetting } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import * as api from '../../vscode-azurefunctions.api';
import { getWorkspaceSetting, updateWorkspaceSetting } from '../../vsCodeConfig/settings';
import { createNewProjectInternal } from './createNewProject';

// Use 'host.json' as an indicator that this is a functions project
export async function isFunctionProject(folderPath: string): Promise<boolean> {
    return await fse.pathExists(path.join(folderPath, hostFileName));
}

/**
 * Checks root folder and subFolders one level down
 * If a single function project is found, returns that path.
 * If multiple projects are found, prompt to pick the project.
 */
export async function tryGetFunctionProjectRoot(folderPath: string, suppressPrompt: boolean = false): Promise<string | undefined> {
    let subpath: string | undefined = getWorkspaceSetting(projectSubpathSetting, folderPath);
    if (!subpath) {
        if (getWorkspaceSetting<boolean>('suppressProject', folderPath)) {
            return undefined;
        } else if (!(await fse.pathExists(folderPath))) {
            return undefined;
        } else if (await isFunctionProject(folderPath)) {
            return folderPath;
        } else {
            const subpaths: string[] = await fse.readdir(folderPath);
            const matchingSubpaths: string[] = [];
            await Promise.all(subpaths.map(async s => {
                if (await isFunctionProject(path.join(folderPath, s))) {
                    matchingSubpaths.push(s);
                }
            }));

            if (matchingSubpaths.length === 1) {
                subpath = matchingSubpaths[0];
            } else if (matchingSubpaths.length !== 0 && !suppressPrompt) {
                subpath = await promptForProjectSubpath(folderPath, matchingSubpaths);
            } else {
                return undefined;
            }
        }
    }

    return path.join(folderPath, subpath);
}

async function promptForProjectSubpath(workspacePath: string, matchingSubpaths: string[]): Promise<string> {
    const message: string = localize('detectedMultipleProject', 'Detected multiple function projects in the same workspace folder. You must either set the default or use a multi-root workspace.');
    const learnMoreLink: string = 'https://aka.ms/AA4nmfy';
    const setDefault: MessageItem = { title: localize('setDefault', 'Set default') };
    // No need to check result - cancel will throw a UserCancelledError
    await ext.ui.showWarningMessage(message, { learnMoreLink }, setDefault);

    const picks: IAzureQuickPickItem<string>[] = matchingSubpaths.map(p => { return { label: p, description: workspacePath, data: p }; });
    const placeHolder: string = localize('selectProject', 'Select the default project subpath');
    const subpath: string = (await ext.ui.showQuickPick(picks, { placeHolder })).data;
    await updateWorkspaceSetting(projectSubpathSetting, subpath, workspacePath);

    return subpath;
}

/**
 * Checks if the path is already a function project. If not, it will prompt to create a new project and return undefined
 */
export async function verifyAndPromptToCreateProject(context: IActionContext, fsPath: string, options?: api.ICreateFunctionOptions): Promise<string | undefined> {
    // tslint:disable-next-line: strict-boolean-expressions
    options = options || {};

    const projectPath: string | undefined = await tryGetFunctionProjectRoot(fsPath);
    if (!projectPath) {
        if (!options.suppressCreateProjectPrompt) {
            const message: string = localize('notFunctionApp', 'The selected folder is not a function project. Create new project?');
            // No need to check result - cancel will throw a UserCancelledError
            await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes);
        }

        options.folderPath = fsPath;
        await createNewProjectInternal(context, options);
        return undefined;
    } else {
        return projectPath;
    }
}
