/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { OutputChannel } from 'vscode';
import { IUserInterface, Pick } from '../../IUserInterface';
import { localize } from '../../localize';
import { extensionPrefix, ProjectLanguage, projectLanguageSetting, projectRuntimeSetting, TemplateFilter, templateFilterSetting } from '../../ProjectSettings';
import * as fsUtil from '../../utils/fs';
import { confirmOverwriteFile } from '../../utils/fs';
import { gitUtils } from '../../utils/gitUtils';
import * as workspaceUtil from '../../utils/workspace';
import { VSCodeUI } from '../../VSCodeUI';
import { IProjectCreator } from './IProjectCreator';
import { JavaProjectCreator } from './JavaProjectCreator';
import { JavaScriptProjectCreator } from './JavaScriptProjectCreator';

const launchTaskId: string = 'launchFunctionApp';

const funcProblemMatcher: {} = {
    owner: extensionPrefix,
    pattern: [
        {
            regexp: '\\b\\B',
            file: 1,
            location: 2,
            message: 3
        }
    ],
    background: {
        activeOnStart: true,
        beginsPattern: '^.*Stopping host.*',
        endsPattern: '^.*Job host started.*'
    }
};

export async function createNewProject(telemetryProperties: { [key: string]: string; }, outputChannel: OutputChannel, functionAppPath?: string, openFolder: boolean = true, ui: IUserInterface = new VSCodeUI()): Promise<void> {
    if (functionAppPath === undefined) {
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectFunctionAppFolderNew', 'Select the folder that will contain your function app'));
    }

    // Only display 'supported' languages that can be debugged in VS Code
    const languagePicks: Pick[] = [
        new Pick(ProjectLanguage.JavaScript),
        new Pick(ProjectLanguage.Java)
    ];
    const language: string = (await ui.showQuickPick(languagePicks, localize('azFunc.selectFuncTemplate', 'Select a language for your function project'))).label;
    telemetryProperties.projectLanguage = language;

    let projectCreator: IProjectCreator;
    switch (language) {
        case ProjectLanguage.Java:
            projectCreator = new JavaProjectCreator(outputChannel, ui);
            break;
        case ProjectLanguage.JavaScript:
            projectCreator = new JavaScriptProjectCreator();
            break;
        default:
            throw new Error(localize('unrecognizedLanguage', 'Unrecognized language "{0}"', language));
    }

    await projectCreator.addNonVSCodeFiles(functionAppPath);

    const vscodePath: string = path.join(functionAppPath, '.vscode');
    await fse.ensureDir(vscodePath);

    if (await gitUtils.isGitInstalled(functionAppPath)) {
        await gitUtils.gitInit(outputChannel, functionAppPath);
    }

    const tasksJsonPath: string = path.join(vscodePath, 'tasks.json');
    if (await confirmOverwriteFile(tasksJsonPath)) {
        await fsUtil.writeFormattedJson(tasksJsonPath, projectCreator.getTasksJson(launchTaskId, funcProblemMatcher));
    }

    const launchJsonPath: string = path.join(vscodePath, 'launch.json');
    if (await confirmOverwriteFile(launchJsonPath)) {
        await fsUtil.writeFormattedJson(launchJsonPath, projectCreator.getLaunchJson(launchTaskId));
    }

    const settingsJsonPath: string = path.join(vscodePath, 'settings.json');
    if (await confirmOverwriteFile(settingsJsonPath)) {
        const settings: {} = {};
        settings[`${extensionPrefix}.${projectRuntimeSetting}`] = projectCreator.getRuntime();
        settings[`${extensionPrefix}.${projectLanguageSetting}`] = language;
        settings[`${extensionPrefix}.${templateFilterSetting}`] = TemplateFilter.Verified;
        await fsUtil.writeFormattedJson(settingsJsonPath, settings);
    }

    if (openFolder && !workspaceUtil.isFolderOpenInWorkspace(functionAppPath)) {
        // If the selected folder is not open in a workspace, open it now. NOTE: This may restart the extension host
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(functionAppPath), false);
    }
}
