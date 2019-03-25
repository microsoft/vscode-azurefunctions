/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { DebugConfiguration, TaskDefinition } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { deploySubpathSetting, extensionPrefix, filesExcludeSetting, gitignoreFileName, launchFileName, preDeployTaskSetting, ProjectLanguage, projectLanguageSetting, ProjectRuntime, projectRuntimeSetting, settingsFileName, tasksFileName } from '../../../constants';
import { confirmEditJsonFile, confirmOverwriteFile, isPathEqual, writeFormattedJson } from '../../../utils/fs';
import { nonNullProp } from '../../../utils/nonNull';
import { IFunctionWizardContext } from '../../createFunction/IFunctionWizardContext';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';

export abstract class InitVSCodeStepBase extends AzureWizardExecuteStep<IProjectWizardContext> {
    protected preDeployTask?: string;
    protected excludedFiles?: string[];
    protected otherSettings: { [key: string]: string } = {};

    private _deploySubpath: string | undefined;

    public async execute(wizardContext: IProjectWizardContext): Promise<void> {
        await this.executeCore(wizardContext);

        const runtime: ProjectRuntime = nonNullProp(wizardContext, 'runtime');
        wizardContext.actionContext.properties.projectRuntime = runtime;

        const language: ProjectLanguage = nonNullProp(wizardContext, 'language');
        wizardContext.actionContext.properties.projectLanguage = language;

        const vscodePath: string = path.join(wizardContext.workspacePath, '.vscode');
        await fse.ensureDir(vscodePath);
        await this.writeTasksJson(wizardContext, vscodePath, runtime);
        await this.writeLaunchJson(vscodePath, runtime);
        await this.writeSettingsJson(vscodePath, language, runtime);
        await this.writeExtensionsJson(vscodePath, language);

        // Remove '.vscode' from gitignore if applicable
        const gitignorePath: string = path.join(wizardContext.workspacePath, gitignoreFileName);
        if (await fse.pathExists(gitignorePath)) {
            let gitignoreContents: string = (await fse.readFile(gitignorePath)).toString();
            gitignoreContents = gitignoreContents.replace(/^\.vscode\s*$/gm, '');
            await fse.writeFile(gitignorePath, gitignoreContents);
        }
    }

    public shouldExecute(_wizardContext: IProjectWizardContext): boolean {
        return true;
    }

    protected abstract executeCore(wizardContext: IProjectWizardContext): Promise<void>;
    protected abstract getTasks(runtime: ProjectRuntime): TaskDefinition[];
    protected getDebugConfiguration?(runtime: ProjectRuntime): DebugConfiguration;
    protected getRecommendedExtensions?(language: ProjectLanguage): string[];

    protected setDeploySubpath(wizardContext: IProjectWizardContext, deploySubpath: string): string {
        this._deploySubpath = this.addSubDir(wizardContext, deploySubpath);
        return this._deploySubpath;
    }

    protected addSubDir(wizardContext: IProjectWizardContext, fsPath: string): string {
        const subDir: string = path.relative(wizardContext.workspacePath, wizardContext.projectPath);
        // always use posix for debug config
        return path.posix.join(subDir, fsPath);
    }

    private async writeTasksJson(wizardContext: IFunctionWizardContext, vscodePath: string, runtime: ProjectRuntime): Promise<void> {
        const tasksJsonPath: string = path.join(vscodePath, tasksFileName);
        if (await confirmOverwriteFile(tasksJsonPath)) {
            const tasks: TaskDefinition[] = this.getTasks(runtime);
            for (const task of tasks) {
                // tslint:disable-next-line: strict-boolean-expressions no-unsafe-any
                let cwd: string = (task.options && task.options.cwd) || '.';
                cwd = this.addSubDir(wizardContext, cwd);
                if (!isPathEqual(cwd, '.')) {
                    // tslint:disable-next-line: strict-boolean-expressions
                    task.options = task.options || {};
                    // always use posix for debug config
                    // tslint:disable-next-line: no-unsafe-any no-invalid-template-strings
                    task.options.cwd = path.posix.join('${workspaceFolder}', cwd);
                }
            }

            await writeFormattedJson(tasksJsonPath, { version: '2.0.0', tasks });
        }
    }

    private async writeLaunchJson(vscodePath: string, runtime: ProjectRuntime): Promise<void> {
        if (this.getDebugConfiguration) {
            const launchJsonPath: string = path.join(vscodePath, launchFileName);
            if (await confirmOverwriteFile(launchJsonPath)) {
                const debugConfig: DebugConfiguration = this.getDebugConfiguration(runtime);
                await writeFormattedJson(launchJsonPath, { version: '0.2.0', configurations: [debugConfig] });
            }
        }
    }

    private async writeSettingsJson(vscodePath: string, language: string, runtime: ProjectRuntime): Promise<void> {
        const settingsJsonPath: string = path.join(vscodePath, settingsFileName);
        await confirmEditJsonFile(
            settingsJsonPath,
            (data: {}): {} => {
                data[`${extensionPrefix}.${projectRuntimeSetting}`] = runtime;
                data[`${extensionPrefix}.${projectLanguageSetting}`] = language;

                if (this._deploySubpath) {
                    data[`${extensionPrefix}.${deploySubpathSetting}`] = this._deploySubpath;
                }
                if (this.preDeployTask) {
                    data[`${extensionPrefix}.${preDeployTaskSetting}`] = this.preDeployTask;
                }
                if (this.excludedFiles) {
                    data[filesExcludeSetting] = this.addToFilesExcludeSetting(this.excludedFiles, data);
                }

                for (const key of Object.keys(this.otherSettings)) {
                    data[key] = this.otherSettings[key];
                }

                // We want the terminal to be open after F5, not the debug console (Since http triggers are printed in the terminal)
                data['debug.internalConsoleOptions'] = 'neverOpen';

                return data;
            }
        );
    }

    private async writeExtensionsJson(vscodePath: string, language: ProjectLanguage): Promise<void> {
        const extensionsJsonPath: string = path.join(vscodePath, 'extensions.json');
        await confirmEditJsonFile(
            extensionsJsonPath,
            (data: IRecommendations): {} => {
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

    private addToFilesExcludeSetting(filesToExclude: string[], data: {}): { [key: string]: boolean } {
        // tslint:disable-next-line:no-unsafe-any strict-boolean-expressions
        const result: { [key: string]: boolean } = data[filesExcludeSetting] || {};
        for (const file of filesToExclude) {
            result[file] = true;
        }
        return result;
    }
}

interface IRecommendations {
    recommendations?: string[];
}
