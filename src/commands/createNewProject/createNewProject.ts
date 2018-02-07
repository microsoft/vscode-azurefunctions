/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { OutputChannel } from 'vscode';
import { TelemetryProperties } from 'vscode-azureextensionui';
import { IUserInterface, Pick } from '../../IUserInterface';
import { localize } from '../../localize';
import { deploySubpathSetting, extensionPrefix, getGlobalFuncExtensionSetting, ProjectLanguage, projectLanguageSetting, projectRuntimeSetting, templateFilterSetting } from '../../ProjectSettings';
import * as fsUtil from '../../utils/fs';
import { confirmOverwriteFile } from '../../utils/fs';
import { gitUtils } from '../../utils/gitUtils';
import * as workspaceUtil from '../../utils/workspace';
import { VSCodeUI } from '../../VSCodeUI';
import { CSharpProjectCreator } from './CSharpProjectCreator';
import { CSharpScriptProjectCreator } from './CSharpScriptProjectCreator';
import { IProjectCreator } from './IProjectCreator';
import { JavaProjectCreator } from './JavaProjectCreator';
import { JavaScriptProjectCreator } from './JavaScriptProjectCreator';
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export async function createNewProject(telemetryProperties: TelemetryProperties, outputChannel: OutputChannel, functionAppPath?: string, language?: string, openFolder: boolean = true, ui: IUserInterface = new VSCodeUI()): Promise<void> {
    if (functionAppPath === undefined) {
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectFunctionAppFolderNew', 'Select the folder that will contain your function app'));
    }
    await fse.ensureDir(functionAppPath);

    if (!language) {
        language = getGlobalFuncExtensionSetting(projectLanguageSetting);

        if (!language) {
            // Only display 'supported' languages that can be debugged in VS Code
            const languagePicks: Pick[] = [
                new Pick(ProjectLanguage.JavaScript),
                new Pick(ProjectLanguage.CSharp),
                new Pick(ProjectLanguage.Java)
            ];
            language = (await ui.showQuickPick(languagePicks, localize('azFunc.selectFuncTemplate', 'Select a language for your function project'))).label;
        }
    }
    telemetryProperties.projectLanguage = language;

    let projectCreator: IProjectCreator;
    switch (language) {
        case ProjectLanguage.Java:
            projectCreator = new JavaProjectCreator(outputChannel, ui);
            break;
        case ProjectLanguage.JavaScript:
            projectCreator = new JavaScriptProjectCreator();
            break;
        case ProjectLanguage.CSharp:
            projectCreator = new CSharpProjectCreator(outputChannel, ui);
            break;
        case ProjectLanguage.CSharpScript:
            projectCreator = new CSharpScriptProjectCreator();
            break;
        default:
            projectCreator = new ScriptProjectCreatorBase();
            break;
    }

    await projectCreator.addNonVSCodeFiles(functionAppPath);

    const vscodePath: string = path.join(functionAppPath, '.vscode');
    await fse.ensureDir(vscodePath);

    if (await gitUtils.isGitInstalled(functionAppPath)) {
        await gitUtils.gitInit(outputChannel, functionAppPath);
    }

    const tasksJsonPath: string = path.join(vscodePath, 'tasks.json');
    if (await confirmOverwriteFile(tasksJsonPath)) {
        await fsUtil.writeFormattedJson(tasksJsonPath, projectCreator.getTasksJson());
    }

    if (projectCreator.getLaunchJson) {
        const launchJsonPath: string = path.join(vscodePath, 'launch.json');
        if (await confirmOverwriteFile(launchJsonPath)) {
            await fsUtil.writeFormattedJson(launchJsonPath, projectCreator.getLaunchJson());
        }
    }

    const globalRuntimeSetting: string | undefined = getGlobalFuncExtensionSetting(projectRuntimeSetting);
    const globalFilterSetting: string | undefined = getGlobalFuncExtensionSetting(templateFilterSetting);
    const runtime: string = globalRuntimeSetting ? globalRuntimeSetting : projectCreator.runtime;
    const templateFilter: string = globalFilterSetting ? globalFilterSetting : projectCreator.templateFilter;
    telemetryProperties.projectRuntime = runtime;
    telemetryProperties.templateFilter = templateFilter;

    const settingsJsonPath: string = path.join(vscodePath, 'settings.json');
    if (await confirmOverwriteFile(settingsJsonPath)) {
        const settings: {} = {};
        settings[`${extensionPrefix}.${projectRuntimeSetting}`] = runtime;
        settings[`${extensionPrefix}.${projectLanguageSetting}`] = language;
        settings[`${extensionPrefix}.${templateFilterSetting}`] = templateFilter;
        if (projectCreator.deploySubpath) {
            settings[`${extensionPrefix}.${deploySubpathSetting}`] = projectCreator.deploySubpath;
        }
        await fsUtil.writeFormattedJson(settingsJsonPath, settings);
    }

    if (projectCreator.getRecommendedExtensions) {
        const extensionsJsonPath: string = path.join(vscodePath, 'extensions.json');
        if (await confirmOverwriteFile(extensionsJsonPath)) {
            await fsUtil.writeFormattedJson(extensionsJsonPath, {
                recommendations: projectCreator.getRecommendedExtensions()
            });
        }
    }

    if (openFolder && !workspaceUtil.isFolderOpenInWorkspace(functionAppPath)) {
        // If the selected folder is not open in a workspace, open it now. NOTE: This may restart the extension host
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(functionAppPath), false);
    }
}
