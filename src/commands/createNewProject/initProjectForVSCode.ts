/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { OutputChannel } from 'vscode';
import { IActionContext, IAzureUserInput, TelemetryProperties } from 'vscode-azureextensionui';
import { deploySubpathSetting, extensionPrefix, gitignoreFileName, preDeployTaskSetting, projectLanguageSetting, projectRuntimeSetting, templateFilterSetting } from '../../constants';
import { localize } from '../../localize';
import { getGlobalFuncExtensionSetting, promptForProjectLanguage } from '../../ProjectSettings';
import { confirmOverwriteFile } from '../../utils/fs';
import * as fsUtil from '../../utils/fs';
import * as workspaceUtil from '../../utils/workspace';
import { getProjectCreator } from './createNewProject';
import { detectProjectLanguage } from './detectProjectLanguage';
import { ProjectCreatorBase } from './IProjectCreator';

export async function initProjectForVSCode(actionContext: IActionContext, ui: IAzureUserInput, outputChannel: OutputChannel, functionAppPath?: string, language?: string, runtime?: string, projectCreator?: ProjectCreatorBase): Promise<ProjectCreatorBase> {
    const telemetryProperties: TelemetryProperties = actionContext.properties;
    if (functionAppPath === undefined) {
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectFunctionAppFolderNew', 'Select the folder to initialize for use with VS Code'));
    }
    await fse.ensureDir(functionAppPath);

    if (!language) {
        // tslint:disable-next-line:strict-boolean-expressions
        language = getGlobalFuncExtensionSetting(projectLanguageSetting) || await detectProjectLanguage(functionAppPath) || await promptForProjectLanguage(ui);
    }
    telemetryProperties.projectLanguage = language;

    outputChannel.show();
    outputChannel.appendLine(localize('usingLanguage', 'Using "{0}" as the project language...', language));

    if (!projectCreator) {
        projectCreator = getProjectCreator(language, functionAppPath, actionContext);
    }

    // tslint:disable-next-line:strict-boolean-expressions
    runtime = runtime || getGlobalFuncExtensionSetting(projectRuntimeSetting) || await projectCreator.getRuntime();
    outputChannel.appendLine(localize('usingRuntime', 'Using "{0}" as the project runtime...', runtime));
    telemetryProperties.projectRuntime = runtime;

    // tslint:disable-next-line:strict-boolean-expressions
    const templateFilter: string = getGlobalFuncExtensionSetting(templateFilterSetting) || projectCreator.templateFilter;
    outputChannel.appendLine(localize('usingTemplateFilter', 'Using "{0}" as the project templateFilter...', templateFilter));
    telemetryProperties.templateFilter = templateFilter;

    const vscodePath: string = path.join(functionAppPath, '.vscode');
    await fse.ensureDir(vscodePath);
    outputChannel.appendLine(localize('writingDebugConfig', 'Writing project debug configuration...'));
    await writeDebugConfiguration(projectCreator, vscodePath, ui, runtime);
    outputChannel.appendLine(localize('writingSettings', 'Writing project settings...'));
    await writeVSCodeSettings(projectCreator, vscodePath, runtime, language, templateFilter, ui);
    outputChannel.appendLine(localize('writingRecommendations', 'Writing extension recommendations...'));
    await writeExtensionRecommendations(projectCreator, vscodePath, ui);

    // Remove '.vscode' from gitignore if applicable
    const gitignorePath: string = path.join(functionAppPath, gitignoreFileName);
    if (await fse.pathExists(gitignorePath)) {
        outputChannel.appendLine(localize('gitignoreVSCode', 'Verifying ".vscode" is not listed in gitignore...'));
        let gitignoreContents: string = (await fse.readFile(gitignorePath)).toString();
        gitignoreContents = gitignoreContents.replace(/^\.vscode\s*$/gm, '');
        await fse.writeFile(gitignorePath, gitignoreContents);
    }

    outputChannel.appendLine(localize('finishedInitializing', 'Finished initializing for use with VS Code.'));
    return projectCreator;
}

async function writeDebugConfiguration(projectCreator: ProjectCreatorBase, vscodePath: string, ui: IAzureUserInput, runtime: string): Promise<void> {
    const tasksJsonPath: string = path.join(vscodePath, 'tasks.json');
    if (await confirmOverwriteFile(tasksJsonPath, ui)) {
        await fsUtil.writeFormattedJson(tasksJsonPath, await projectCreator.getTasksJson(runtime));
    }

    const launchJson: {} | undefined = projectCreator.getLaunchJson();
    if (launchJson) {
        const launchJsonPath: string = path.join(vscodePath, 'launch.json');
        if (await confirmOverwriteFile(launchJsonPath, ui)) {
            await fsUtil.writeFormattedJson(launchJsonPath, launchJson);
        }
    }
}

async function writeVSCodeSettings(projectCreator: ProjectCreatorBase, vscodePath: string, runtime: string, language: string, templateFilter: string, ui: IAzureUserInput): Promise<void> {
    const settingsJsonPath: string = path.join(vscodePath, 'settings.json');
    await fsUtil.confirmEditJsonFile(
        settingsJsonPath,
        (data: {}): {} => {
            data[`${extensionPrefix}.${projectRuntimeSetting}`] = runtime;
            data[`${extensionPrefix}.${projectLanguageSetting}`] = language;
            data[`${extensionPrefix}.${templateFilterSetting}`] = templateFilter;
            if (projectCreator.deploySubpath) {
                data[`${extensionPrefix}.${deploySubpathSetting}`] = projectCreator.deploySubpath;
            }
            if (projectCreator.preDeployTask) {
                data[`${extensionPrefix}.${preDeployTaskSetting}`] = projectCreator.preDeployTask;
            }
            return data;
        },
        ui
    );
}

async function writeExtensionRecommendations(projectCreator: ProjectCreatorBase, vscodePath: string, ui: IAzureUserInput): Promise<void> {
    const extensionsJsonPath: string = path.join(vscodePath, 'extensions.json');
    await fsUtil.confirmEditJsonFile(
        extensionsJsonPath,
        (data: IRecommendations): {} => {
            let recommendations: string[] = projectCreator.getRecommendedExtensions();

            if (data.recommendations) {
                recommendations = recommendations.concat(data.recommendations);
            }

            // de-dupe array
            data.recommendations = recommendations.filter((rec: string, index: number) => recommendations.indexOf(rec) === index);
            return data;
        },
        ui
    );
}

interface IRecommendations {
    recommendations?: string[];
}
