/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type DebugConfiguration, type MessageItem, type TaskDefinition, type WorkspaceFolder } from 'vscode';
import { type FuncVersion } from '../../../FuncVersion';
import { deploySubpathSetting, extensionId, func, funcVersionSetting, gitignoreFileName, launchFileName, preDeployTaskSetting, projectLanguageModelSetting, projectLanguageSetting, projectSubpathSetting, settingsFileName, tasksFileName, type ProjectLanguage } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { confirmEditJsonFile, isPathEqual, isSubpath } from '../../../utils/fs';
import { nonNullProp } from '../../../utils/nonNull';
import { isMultiRootWorkspace } from '../../../utils/workspace';
import { type IExtensionsJson } from '../../../vsCodeConfig/extensions';
import { getDebugConfigs, getLaunchVersion, isDebugConfigEqual, launchVersion, updateDebugConfigs, updateLaunchVersion, type ILaunchJson } from '../../../vsCodeConfig/launch';
import { updateWorkspaceSetting } from '../../../vsCodeConfig/settings';
import { getTasks, getTasksVersion, tasksVersion, updateTasks, updateTasksVersion, type ITask, type ITasksJson } from '../../../vsCodeConfig/tasks';
import { type IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';

export abstract class InitVSCodeStepBase extends AzureWizardExecuteStepWithActivityOutput<IProjectWizardContext> {
    public priority: number = 20;

    protected preDeployTask?: string;
    protected settings: ISettingToAdd[] = [];
    protected getTreeItemLabel(context: IProjectWizardContext): string {
        return localize('initVSCode', 'Initialize {0} project for VS Code', context.language);
    }
    protected getOutputLogSuccess(context: IProjectWizardContext): string {
        return localize('initVSCodeSuccess', 'Successfully initialized {0} project for VS Code.', context.language);
    }
    protected getOutputLogFail(context: IProjectWizardContext): string {
        return localize('initVSCodeFail', 'Failed to initialize {0} project for VS Code', context.language);
    }
    protected getOutputLogProgress(context: IProjectWizardContext): string {
        return localize('initializingVSCode', 'Initializing {0} project for VS Code...', context.language);
    }

    public async execute(context: IProjectWizardContext): Promise<void> {
        await this.executeCore(context);

        const version: FuncVersion = nonNullProp(context, 'version');
        context.telemetry.properties.projectRuntime = version;

        const language: ProjectLanguage = nonNullProp(context, 'language');
        context.telemetry.properties.projectLanguage = language;

        context.telemetry.properties.isProjectInSubDir = String(isSubpath(context.workspacePath, context.projectPath));

        const vscodePath: string = path.join(context.workspacePath, '.vscode');
        await AzExtFsExtra.ensureDir(vscodePath);
        await this.writeTasksJson(context, vscodePath, language);
        await this.writeLaunchJson(context, context.workspaceFolder, vscodePath, version);
        await this.writeSettingsJson(context, vscodePath, language, context.languageModel, version);
        await this.writeExtensionsJson(context, vscodePath, language);

        // Remove '.vscode' from gitignore if applicable
        const gitignorePath: string = path.join(context.workspacePath, gitignoreFileName);
        if (await AzExtFsExtra.pathExists(gitignorePath)) {
            let gitignoreContents: string = (await AzExtFsExtra.readFile(gitignorePath)).toString();
            gitignoreContents = gitignoreContents.replace(/^\.vscode(\/|\\)?\s*$/gm, '');
            await AzExtFsExtra.writeFile(gitignorePath, gitignoreContents);
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
            await updateTasks(context.workspaceFolder, await this.insertNewTasks(context, getTasks(context.workspaceFolder), newTasks));
        } else { // otherwise manually edit json
            const tasksJsonPath: string = path.join(vscodePath, tasksFileName);
            await confirmEditJsonFile(
                context,
                tasksJsonPath,
                async (data: ITasksJson): Promise<ITasksJson> => {
                    if (!data.version) {
                        data.version = tasksVersion;
                    } else if (data.version !== tasksVersion) {
                        throw versionMismatchError;
                    }
                    data.tasks = await this.insertNewTasks(context, data.tasks, newTasks);
                    return data;
                }
            );
        }
    }

    private async insertNewTasks(context: IActionContext, existingTasks: ITask[] | undefined, newTasks: ITask[]): Promise<ITask[]> {
        existingTasks = existingTasks || [];

        // remove new tasks that have an identical existing task
        newTasks = newTasks.filter(t1 => {
            // improve JSON.stringify comparison by sorting keys first
            function stringifySorted(value: {}) {
                return JSON.stringify(value, Object.keys(value).sort());
            }
            const t1String = stringifySorted(t1);
            return !existingTasks?.some(t2 => {
                // just for the sake of comparison: add label to existing task if it doesn't have one
                return t1String === stringifySorted({ ...t2, label: this.getTaskLabel(t2) });
            });
        });

        const nonMatchingTasks: ITask[] = [];
        const matchingTaskLabels: string[] = [];
        for (const existingTask of existingTasks) {
            const existingLabel = this.getTaskLabel(existingTask);
            if (existingLabel && newTasks.some(newTask => existingLabel === this.getTaskLabel(newTask) && existingTask.type === newTask.type)) {
                matchingTaskLabels.push(existingLabel);
            } else {
                nonMatchingTasks.push(existingTask);
            }
        }

        if (matchingTaskLabels.length > 0) {
            const message = localize('confirmOverwriteTasks', 'This will overwrite the following tasks in your tasks.json: "{0}"', matchingTaskLabels.join('", "'));
            const overwrite: MessageItem = { title: localize('overwrite', 'Overwrite') };
            await context.ui.showWarningMessage(message, { modal: true, stepName: 'confirmOverwriteTasks' }, overwrite)
        }

        return nonMatchingTasks.concat(...newTasks);
    }

    private getTaskLabel(task: ITask): string | undefined {
        switch (task.type) {
            case func:
                if (!task.label) {
                    return `${task.type}: ${task.command}`;
                } else {
                    return task.label;
                }
            case 'shell':
            case 'process':
                return task.label;
            default:
                return undefined;
        }
    }

    private async writeLaunchJson(context: IActionContext, folder: WorkspaceFolder | undefined, vscodePath: string, version: FuncVersion): Promise<void> {
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
                    context,
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

    private async writeSettingsJson(context: IProjectWizardContext, vscodePath: string, language: string, languageModel: number | undefined, version: FuncVersion): Promise<void> {
        const settings: ISettingToAdd[] = this.settings.concat(
            { key: projectLanguageSetting, value: language },
            { key: funcVersionSetting, value: version },
            // We want the terminal to be open after F5, not the debug console (Since http triggers are printed in the terminal)
            { prefix: 'debug', key: 'internalConsoleOptions', value: 'neverOpen' }
        );

        if (languageModel) {
            settings.push({ key: projectLanguageModelSetting, value: languageModel });
        }

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
                context,
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

    private async writeExtensionsJson(context: IActionContext, vscodePath: string, language: ProjectLanguage): Promise<void> {
        const extensionsJsonPath: string = path.join(vscodePath, 'extensions.json');
        await confirmEditJsonFile(
            context,
            extensionsJsonPath,
            (data: IExtensionsJson): {} => {
                const recommendations: string[] = [extensionId];
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
