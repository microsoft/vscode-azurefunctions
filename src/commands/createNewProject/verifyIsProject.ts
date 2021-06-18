/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { MessageItem, RelativePattern, workspace } from 'vscode';
import { DialogResponses, IActionContext, IAzureQuickPickItem } from 'vscode-azureextensionui';
import { hostFileName, projectSubpathSetting } from '../../constants';
import { localize } from '../../localize';
import * as api from '../../vscode-azurefunctions.api';
import { getWorkspaceSetting, updateWorkspaceSetting } from '../../vsCodeConfig/settings';
import { createNewProjectInternal } from './createNewProject';

// Use 'host.json' as an indicator that this is a functions project
export async function isFunctionProject(folderPath: string): Promise<boolean> {
    return await fse.pathExists(path.join(folderPath, hostFileName));
}

/**
 * Describes what to do if multiple projects are found
 */
export type MultiProjectPromptBehavior = 'silent' | 'prompt' | 'modalPrompt';

/**
 * Checks root folder and one level down first, then all levels of tree
 * If a single function project is found, returns that path.
 * If multiple projects are found, prompt to pick the project.
 */
export async function tryGetFunctionProjectRoot(context: IActionContext, folderPath: string, promptBehavior: MultiProjectPromptBehavior = 'silent'): Promise<string | undefined> {
    if (!getWorkspaceSetting<boolean>('suppressProject', folderPath)) {
        const subpath: string | undefined = getWorkspaceSetting(projectSubpathSetting, folderPath);
        if (subpath) {
            return path.join(folderPath, subpath);
        } else if (await fse.pathExists(folderPath)) {
            if (await isFunctionProject(folderPath)) {
                return folderPath;
            } else {
                const hostJsonUris = await workspace.findFiles(new RelativePattern(folderPath, `*/${hostFileName}`));
                if (hostJsonUris.length !== 1) {
                    // NOTE: If we found a single project at the root or one level down, we will use that without searching any further.
                    // This will reduce false positives in the case of compiled languages like C# where a 'host.json' file is often copied to a build/publish directory a few levels down
                    // It also maintains consistent historical behavior by giving that project priority because we used to _only_ look at the root and one level down
                    hostJsonUris.push(...await workspace.findFiles(new RelativePattern(folderPath, `*/*/**/${hostFileName}`)));
                }

                const projectPaths = hostJsonUris.map(uri => path.dirname(uri.fsPath));
                if (projectPaths.length === 1) {
                    return projectPaths[0];
                } else if (projectPaths.length > 1 && promptBehavior !== 'silent') {
                    const subpaths = projectPaths.map(p => path.relative(folderPath, p));
                    const pickedSubpath = await promptForProjectSubpath(context, folderPath, subpaths, promptBehavior);
                    return path.join(folderPath, pickedSubpath);
                }
            }
        }
    }

    return undefined;
}

async function promptForProjectSubpath(context: IActionContext, workspacePath: string, matchingSubpaths: string[], promptLevel: MultiProjectPromptBehavior): Promise<string> {
    const message: string = localize('detectedMultipleProject', 'Detected multiple function projects in the same workspace folder. You must either set the default or use a multi-root workspace.');
    const learnMoreLink: string = 'https://aka.ms/AA4nmfy';
    const setDefault: MessageItem = { title: localize('setDefault', 'Set default') };
    // No need to check result - cancel will throw a UserCancelledError
    await context.ui.showWarningMessage(message, { learnMoreLink, modal: promptLevel === 'modalPrompt' }, setDefault);

    const picks: IAzureQuickPickItem<string>[] = matchingSubpaths.map(p => { return { label: p, data: p }; });
    const placeHolder: string = localize('selectProject', 'Select the default project subpath');
    const subpath: string = (await context.ui.showQuickPick(picks, { placeHolder })).data;
    await updateWorkspaceSetting(projectSubpathSetting, subpath, workspacePath);

    return subpath;
}

/**
 * Checks if the path is already a function project. If not, it will prompt to create a new project and return undefined
 */
export async function verifyAndPromptToCreateProject(context: IActionContext, fsPath: string, options?: api.ICreateFunctionOptions): Promise<string | undefined> {
    options = options || {};

    const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, fsPath, 'modalPrompt');
    if (!projectPath) {
        if (!options.suppressCreateProjectPrompt) {
            const message: string = localize('notFunctionApp', 'The selected folder is not a function project. Create new project?');
            // No need to check result - cancel will throw a UserCancelledError
            await context.ui.showWarningMessage(message, { modal: true }, DialogResponses.yes);
        }

        options.folderPath = fsPath;
        await createNewProjectInternal(context, options);
        return undefined;
    } else {
        return projectPath;
    }
}
