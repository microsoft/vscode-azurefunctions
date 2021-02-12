/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { DebugConfiguration, TaskDefinition, WorkspaceFolder } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { deploySubpathSetting, func, funcVersionSetting, gitignoreFileName, launchFileName, preDeployTaskSetting, ProjectLanguage, projectLanguageSetting, projectSubpathSetting, settingsFileName, tasksFileName } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { FuncVersion } from '../../../FuncVersion';
import { localize } from '../../../localize';
import { confirmEditJsonFile, isPathEqual, isSubpath } from '../../../utils/fs';
import { nonNullProp } from '../../../utils/nonNull';
import { isMultiRootWorkspace } from '../../../utils/workspace';
import { IExtensionsJson } from '../../../vsCodeConfig/extensions';
import { getDebugConfigs, getLaunchVersion, ILaunchJson, isDebugConfigEqual, launchVersion, updateDebugConfigs, updateLaunchVersion } from '../../../vsCodeConfig/launch';
import { updateWorkspaceSetting } from '../../../vsCodeConfig/settings';
import { getTasks, getTasksVersion, ITask, ITasksJson, tasksVersion, updateTasks, updateTasksVersion } from '../../../vsCodeConfig/tasks';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';

export abstract class InitVSCodeStepBase extends AzureWizardExecuteStep<IProjectWizardContext> {
    public priority: number = 20;

    protected preDeployTask?: string;
    protected settings: ISettingToAdd[] = [];

    public async execute(context: IProjectWizardContext): Promise<void> {
        await this.executeCore(context);

        const version: FuncVersion = nonNullProp(context, 'version');
        context.telemetry.properties.projectRuntime = version;

        const language: ProjectLanguage = nonNullProp(context, 'language');
        context.telemetry.properties.projectLanguage = language;

        context.telemetry.properties.isProjectInSubDir = String(isSubpath(context.workspacePath, context.projectPath));

        const vscodePath: string = path.join(context.workspacePath, '.vscode');
        await fse.ensureDir(vscodePath);
        await this.writeTasksJson(context, vscodePath, language);
        await this.writeLaunchJson(context.workspaceFolder, vscodePath, version);
        await this.writeSettingsJson(context, vscodePath, language, version);
        await this.writeExtensionsJson(vscodePath, language);

        // Remove '.vscode' from gitignore if applicable
        const gitignorePath: string = path.join(context.workspacePath, gitignoreFileName);
        if (await fse.pathExists(gitignorePath)) {
            let gitignoreContents: string = (await fse.readFile(gitignorePath)).toString();
            gitignoreContents = gitignoreContents.replace(/^\.vscode(\/|\\)?\s*$/gm, '');
            await fse.writeFile(gitignorePath, gitignoreContents);
        }
    }

    public shouldExecute(_context: IProjectWizardContext): boolean {
        return true;
    }

    protected abstract executeCore(context: IProjectWizardContext): Promise<void>;
    protected abstract getTasks(language: ProjectLanguage): TaskDefinition[];
    protected getDebugConfiguration?(version: FuncVersion): DebugConfiguration;
    protected getRecommendedExtensions?(language: ProjectLanguage): string[];

    protected setDeploySubpath(context: IProjectWizardContext, deploySubpath: string): string {
        deploySubpath = this.addSubDir(context, deploySubpath);
        this.settings.push({ key: deploySubpathSetting, value: deploySubpath });
        return deploySubpath;
    }

    protected addSubDir(context: IProjectWizardContext, fsPath: string): string {
        const subDir: string = path.relative(context.workspacePath, context.projectPath);
        // always use posix for debug config
        return path.posix.join(subDir, fsPath);
    }

    private async writeTasksJson(context: IProjectWizardContext, vscodePath: string, language: ProjectLanguage): Promise<void> {
        const newTasks: TaskDefinition[] = this.getTasks(language);
        for (const task of newTasks) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            let cwd: string = (task.options && task.options.cwd) || '.';
            cwd = this.addSubDir(context, cwd);
            if (!isPathEqual(cwd, '.')) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                task.options = task.options || {};
                // always use posix for debug config
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                task.options.cwd = path.posix.join('${workspaceFolder}', cwd);
            }
        }

        const versionMismatchError: Error = new Error(localize('versionMismatchError', 'The version in your {0} must be "{1}" to work with Azure Functions.', tasksFileName, tasksVersion));

        // Use VS Code api to update config if folder is open and it's not a multi-root workspace (https://github.com/Microsoft/vscode-azurefunctions/issues/1235)
        // The VS Code api is better for several reasons, including:
        // 1. It handles comments in json files
        // 2. It sends the 'onDidChangeConfiguration' event
        if (context.workspaceFolder && !isMultiRootWorkspace()) {
            const currentVersion: string | undefined = getTasksVersion(context.workspaceFolder);
            if (!currentVersion) {
                await updateTasksVersion(context.workspaceFolder, tasksVersion);
            } else if (currentVersion !== tasksVersion) {
                throw versionMismatchError;
            }
            await updateTasks(context.workspaceFolder, this.insertNewTasks(getTasks(context.workspaceFolder), newTasks));
        } else { // otherwise manually edit json
            const tasksJsonPath: string = path.join(vscodePath, tasksFileName);
            await confirmEditJsonFile(
                tasksJsonPath,
                (data: ITasksJson): ITasksJson => {
                    if (!data.version) {
                        data.version = tasksVersion;
                    } else if (data.version !== tasksVersion) {
                        throw versionMismatchError;
                    }
                    data.tasks = this.insertNewTasks(data.tasks, newTasks);
                    return data;
                }
            );
        }
    }

    private insertNewTasks(existingTasks: ITask[] | undefined, newTasks: ITask[]): ITask[] {
        existingTasks = existingTasks || [];
        // Remove tasks that match the ones we're about to add
        existingTasks = existingTasks.filter(t1 => !newTasks.find(t2 => {
            if (t1.type === t2.type) {
                switch (t1.type) {
                    case func:
                        return t1.command === t2.command;
                    case 'shell':
                    case 'process':
                        return t1.label === t2.label && t1.identifier === t2.identifier;
                    default:
                        // Not worth throwing an error for unrecognized task type
                        // Worst case the user has an extra task in their tasks.json
                        return false;
                }
            } else {
                return false;
            }
        }));
        existingTasks.push(...newTasks);
        return existingTasks;
    }

    private async writeLaunchJson(folder: WorkspaceFolder | undefined, vscodePath: string, version: FuncVersion): Promise<void> {
        if (this.getDebugConfiguration) {
            const newDebugConfig: DebugConfiguration = this.getDebugConfiguration(version);
            const versionMismatchError: Error = new Error(localize('versionMismatchError', 'The version in your {0} must be "{1}" to work with Azure Functions.', launchFileName, launchVersion));

            // Use VS Code api to update config if folder is open and it's not a multi-root workspace (https://github.com/Microsoft/vscode-azurefunctions/issues/1235)
            // The VS Code api is better for several reasons, including:
            // 1. It handles comments in json files
            // 2. It sends the 'onDidChangeConfiguration' event
            if (folder && !isMultiRootWorkspace()) {
                const currentVersion: string | undefined = getLaunchVersion(folder);
                if (!currentVersion) {
                    await updateLaunchVersion(folder, launchVersion);
                } else if (currentVersion !== launchVersion) {
                    throw versionMismatchError;
                }
                await updateDebugConfigs(folder, this.insertLaunchConfig(getDebugConfigs(folder), newDebugConfig));
            } else { // otherwise manually edit json
                const launchJsonPath: string = path.join(vscodePath, launchFileName);
                await confirmEditJsonFile(
                    launchJsonPath,
                    (data: ILaunchJson): ILaunchJson => {
                        if (!data.version) {
                            data.version = launchVersion;
                        } else if (data.version !== launchVersion) {
                            throw versionMismatchError;
                        }
                        data.configurations = this.insertLaunchConfig(data.configurations, newDebugConfig);
                        return data;
                    }
                );
            }
        }
    }

    private insertLaunchConfig(existingConfigs: DebugConfiguration[] | undefined, newConfig: DebugConfiguration): DebugConfiguration[] {
        existingConfigs = existingConfigs || [];
        existingConfigs = existingConfigs.filter(l1 => !isDebugConfigEqual(l1, newConfig));
        existingConfigs.push(newConfig);
        return existingConfigs;
    }

    private async writeSettingsJson(context: IProjectWizardContext, vscodePath: string, language: string, version: FuncVersion): Promise<void> {
        const settings: ISettingToAdd[] = this.settings.concat(
            { key: projectLanguageSetting, value: language },
            { key: funcVersionSetting, value: version },
            // We want the terminal to be open after F5, not the debug console (Since http triggers are printed in the terminal)
            { prefix: 'debug', key: 'internalConsoleOptions', value: 'neverOpen' }
        );

        // Add "projectSubpath" setting if project is far enough down that we won't auto-detect it
        if (path.posix.relative(context.projectPath, context.workspacePath).startsWith('../..')) {
            settings.push({
                key: projectSubpathSetting,
                value: path.posix.relative(context.workspacePath, context.projectPath)
            });
        }

        if (this.preDeployTask) {
            settings.push({ key: preDeployTaskSetting, value: this.preDeployTask });
        }

        if (context.workspaceFolder) { // Use VS Code api to update config if folder is open
            for (const setting of settings) {
                await updateWorkspaceSetting(setting.key, setting.value, context.workspacePath, setting.prefix);
            }
        } else { // otherwise manually edit json
            const settingsJsonPath: string = path.join(vscodePath, settingsFileName);
            await confirmEditJsonFile(
                settingsJsonPath,
                (data: {}): {} => {
                    for (const setting of settings) {
                        const key: string = `${setting.prefix || ext.prefix}.${setting.key}`;
                        data[key] = setting.value;
                    }
                    return data;
                }
            );
        }
    }

    private async writeExtensionsJson(vscodePath: string, language: ProjectLanguage): Promise<void> {
        const extensionsJsonPath: string = path.join(vscodePath, 'extensions.json');
        await confirmEditJsonFile(
            extensionsJsonPath,
            (data: IExtensionsJson): {} => {
                const recommendations: string[] = ['ms-azuretools.vscode-azurefunctions'];
                if (this.getRecommendedExtensions) {
                    recommendations.push(...this.getRecommendedExtensions(language));
                }

                if (data.recommendations) {
                    recommendations.push(...data.recommendations);
                }

                // de-dupe array
                data.recommendations = recommendations.filter((rec: string, index: number) => recommendations.indexOf(rec) === index);
                return data;
            }
        );
    }
}

interface ISettingToAdd {
    key: string;
    value: string | {};
    prefix?: string;
}
