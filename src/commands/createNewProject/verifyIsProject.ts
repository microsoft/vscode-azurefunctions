/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, IActionContext, IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { MessageItem, WorkspaceFolder } from 'vscode';
import { hostFileName, projectSubpathSetting } from '../../constants';
import { localize } from '../../localize';
import { telemetryUtils } from '../../utils/telemetryUtils';
import { findFiles } from '../../utils/workspace';
import { getWorkspaceSetting, updateWorkspaceSetting } from '../../vsCodeConfig/settings';

// Use 'host.json' as an indicator that this is a functions project
export async function isFunctionProject(folderPath: string): Promise<boolean> {
    return await AzExtFsExtra.pathExists(path.join(folderPath, hostFileName));
}

/**
 * Describes what to do if multiple projects are found
 */
export type MultiProjectPromptBehavior = 'silent' | 'prompt' | 'modalPrompt';

/**
 * Checks root folder and one level down first, then all levels of tree
 * If a single function project is found, returns that path.
 * If multiple projects are found, will prompt based on the value of `promptBehavior`
 * @param workspaceFolder Per the VS Code docs for `findFiles`: It is recommended to pass in a workspace folder if the pattern should match inside the workspace.
 */
export async function tryGetFunctionProjectRoot(context: IActionContext, workspaceFolder: WorkspaceFolder | string, promptBehavior: MultiProjectPromptBehavior = 'silent'): Promise<string | undefined> {
    return await telemetryUtils.runWithDurationTelemetry(context, 'tryGetProject', async () => {
        const folderPath = typeof workspaceFolder === 'string' ? workspaceFolder : workspaceFolder.uri.fsPath;
        if (!getWorkspaceSetting<boolean>('suppressProject', workspaceFolder)) {
            const subpath: string | undefined = getWorkspaceSetting(projectSubpathSetting, workspaceFolder);
            if (subpath) {
                return path.join(folderPath, subpath);
            } else if (await AzExtFsExtra.pathExists(folderPath)) {
                if (await isFunctionProject(folderPath)) {
                    return folderPath;
                } else {
                    const hostJsonUris = await findFiles(workspaceFolder, `*/${hostFileName}`);
                    if (hostJsonUris.length !== 1) {
                        // NOTE: If we found a single project at the root or one level down, we will use that without searching any further.
                        // This will reduce false positives in the case of compiled languages like C# where a 'host.json' file is often copied to a build/publish directory a few levels down
                        // It also maintains consistent historical behavior by giving that project priority because we used to _only_ look at the root and one level down
                        hostJsonUris.push(...await findFiles(workspaceFolder, `*/*/**/${hostFileName}`));
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
    });
}

async function promptForProjectSubpath(context: IActionContext, workspacePath: string, matchingSubpaths: string[], promptBehavior: MultiProjectPromptBehavior): Promise<string> {
    const message: string = localize('detectedMultipleProject', 'Detected multiple function projects in the same workspace folder. You must either set the default or use a multi-root workspace.');
    const learnMoreLink: string = 'https://aka.ms/AA4nmfy';
    const setDefault: MessageItem = { title: localize('setDefault', 'Set default') };
    // No need to check result - cancel will throw a UserCancelledError
    await context.ui.showWarningMessage(message, { learnMoreLink, modal: promptBehavior === 'modalPrompt', stepName: 'multipleProjects' }, setDefault);

    const picks: IAzureQuickPickItem<string>[] = matchingSubpaths.map(p => { return { label: p, data: p }; });
    const placeHolder: string = localize('selectProject', 'Select the default project subpath');
    const subpath: string = (await context.ui.showQuickPick(picks, { placeHolder, stepName: 'multipleProjects|select' })).data;
    await updateWorkspaceSetting(projectSubpathSetting, subpath, workspacePath);

    return subpath;
}

/**
 * Checks if the path is already a function project, if not return undefined
 */
export async function verifyProjectPath(context: IActionContext, workspaceFolder?: WorkspaceFolder | string): Promise<string | undefined> {
    if (workspaceFolder) {
        const projectPath: string | undefined = await tryGetFunctionProjectRoot(context, workspaceFolder, 'modalPrompt');
        if (projectPath) {
            return projectPath;
        }
    }
    return undefined;
}
