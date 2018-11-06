/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { IActionContext, TelemetryProperties } from 'vscode-azureextensionui';
import { deploySubpathSetting, extensionPrefix, filesExcludeSetting, gitignoreFileName, preDeployTaskSetting, projectLanguageSetting, projectRuntimeSetting, templateFilterSetting } from '../../constants';
import { ext } from '../../extensionVariables';
import { tryGetLocalRuntimeVersion } from '../../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from '../../localize';
import { convertStringToRuntime, getGlobalFuncExtensionSetting, promptForProjectLanguage, promptForProjectRuntime } from '../../ProjectSettings';
import { confirmEditJsonFile, confirmOverwriteFile, writeFormattedJson } from '../../utils/fs';
import * as workspaceUtil from '../../utils/workspace';
import { getProjectCreator } from './createNewProject';
import { detectProjectLanguage } from './detectProjectLanguage';
import { ProjectCreatorBase } from './ProjectCreatorBase';

export async function initProjectForVSCode(actionContext: IActionContext, functionAppPath?: string, language?: string, projectCreator?: ProjectCreatorBase): Promise<ProjectCreatorBase> {
    const telemetryProperties: TelemetryProperties = actionContext.properties;
    if (functionAppPath === undefined) {
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ext.ui, localize('azFunc.selectFunctionAppFolderNew', 'Select the folder to initialize for use with VS Code'));
    }
    await fse.ensureDir(functionAppPath);

    if (!language) {
        // tslint:disable-next-line:strict-boolean-expressions
        language = getGlobalFuncExtensionSetting(projectLanguageSetting) || await detectProjectLanguage(functionAppPath) || await promptForProjectLanguage(ext.ui);
    }
    telemetryProperties.projectLanguage = language;

    ext.outputChannel.appendLine(localize('usingLanguage', 'Using "{0}" as the project language...', language));

    if (!projectCreator) {
        const defaultRuntime: string | undefined = getGlobalFuncExtensionSetting(projectRuntimeSetting);
        projectCreator = getProjectCreator(language, functionAppPath, actionContext, convertStringToRuntime(defaultRuntime));
    }

    await projectCreator.onInitProjectForVSCode();

    if (projectCreator.runtime === undefined) {
        // tslint:disable-next-line:strict-boolean-expressions
        projectCreator.runtime = await tryGetLocalRuntimeVersion() || await promptForProjectRuntime();
    }

    ext.outputChannel.appendLine(localize('usingRuntime', 'Using "{0}" as the project runtime...', projectCreator.runtime));
    telemetryProperties.projectRuntime = projectCreator.runtime;

    // tslint:disable-next-line:strict-boolean-expressions
    const templateFilter: string = getGlobalFuncExtensionSetting(templateFilterSetting) || projectCreator.templateFilter;
    ext.outputChannel.appendLine(localize('usingTemplateFilter', 'Using "{0}" as the project templateFilter...', templateFilter));
    telemetryProperties.templateFilter = templateFilter;

    const vscodePath: string = path.join(functionAppPath, '.vscode');
    await fse.ensureDir(vscodePath);
    ext.outputChannel.appendLine(localize('writingDebugConfig', 'Writing project debug configuration...'));
    await writeDebugConfiguration(projectCreator, vscodePath);
    ext.outputChannel.appendLine(localize('writingSettings', 'Writing project settings...'));
    await writeVSCodeSettings(projectCreator, vscodePath, language, templateFilter);
    ext.outputChannel.appendLine(localize('writingRecommendations', 'Writing extension recommendations...'));
    await writeExtensionRecommendations(projectCreator, vscodePath);

    // Remove '.vscode' from gitignore if applicable
    const gitignorePath: string = path.join(functionAppPath, gitignoreFileName);
    if (await fse.pathExists(gitignorePath)) {
        ext.outputChannel.appendLine(localize('gitignoreVSCode', 'Verifying ".vscode" is not listed in gitignore...'));
        let gitignoreContents: string = (await fse.readFile(gitignorePath)).toString();
        gitignoreContents = gitignoreContents.replace(/^\.vscode\s*$/gm, '');
        await fse.writeFile(gitignorePath, gitignoreContents);
    }

    ext.outputChannel.appendLine(localize('finishedInitializing', 'Finished initializing for use with VS Code.'));
    return projectCreator;
}

async function writeDebugConfiguration(projectCreator: ProjectCreatorBase, vscodePath: string): Promise<void> {
    const tasksJsonPath: string = path.join(vscodePath, 'tasks.json');
    if (await confirmOverwriteFile(tasksJsonPath)) {
        await writeFormattedJson(tasksJsonPath, projectCreator.getTasksJson());
    }

    const launchJson: {} | undefined = projectCreator.getLaunchJson();
    if (launchJson) {
        const launchJsonPath: string = path.join(vscodePath, 'launch.json');
        if (await confirmOverwriteFile(launchJsonPath)) {
            await writeFormattedJson(launchJsonPath, launchJson);
        }
    }
}

async function writeVSCodeSettings(projectCreator: ProjectCreatorBase, vscodePath: string, language: string, templateFilter: string): Promise<void> {
    const settingsJsonPath: string = path.join(vscodePath, 'settings.json');
    await confirmEditJsonFile(
        settingsJsonPath,
        (data: {}): {} => {
            data[`${extensionPrefix}.${projectRuntimeSetting}`] = projectCreator.runtime;
            data[`${extensionPrefix}.${projectLanguageSetting}`] = language;
            data[`${extensionPrefix}.${templateFilterSetting}`] = templateFilter;
            if (projectCreator.deploySubpath) {
                data[`${extensionPrefix}.${deploySubpathSetting}`] = projectCreator.deploySubpath;
            }
            if (projectCreator.preDeployTask) {
                data[`${extensionPrefix}.${preDeployTaskSetting}`] = projectCreator.preDeployTask;
            }

            if (projectCreator.excludedFiles) {
                data[filesExcludeSetting] = addToFilesExcludeSetting(projectCreator.excludedFiles, data);
            }

            for (const key of Object.keys(projectCreator.otherSettings)) {
                data[key] = projectCreator.otherSettings[key];
            }

            // We want the terminal to be open after F5, not the debug console (Since http triggers are printed in the terminal)
            data['debug.internalConsoleOptions'] = 'neverOpen';

            return data;
        }
    );
}

async function writeExtensionRecommendations(projectCreator: ProjectCreatorBase, vscodePath: string): Promise<void> {
    const extensionsJsonPath: string = path.join(vscodePath, 'extensions.json');
    await confirmEditJsonFile(
        extensionsJsonPath,
        (data: IRecommendations): {} => {
            let recommendations: string[] = projectCreator.getRecommendedExtensions();

            if (data.recommendations) {
                recommendations = recommendations.concat(data.recommendations);
            }

            // de-dupe array
            data.recommendations = recommendations.filter((rec: string, index: number) => recommendations.indexOf(rec) === index);
            return data;
        }
    );
}

function addToFilesExcludeSetting(filesToExclude: string | string[], data: {}): { [key: string]: boolean } {
    // tslint:disable-next-line:no-unsafe-any
    const workspaceExcludedFiles: { [key: string]: boolean } = data[filesExcludeSetting] ? data[filesExcludeSetting] : {};
    // if multiple directories were passed in, iterate over and include to files.exclude
    if (Array.isArray(filesToExclude)) {
        for (const file of filesToExclude) {
            workspaceExcludedFiles[file] = true;
        }
    } else {
        workspaceExcludedFiles[filesToExclude] = true;
    }
    return workspaceExcludedFiles;
}

interface IRecommendations {
    recommendations?: string[];
}
