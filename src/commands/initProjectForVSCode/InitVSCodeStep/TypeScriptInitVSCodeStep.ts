/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type TaskDefinition } from 'vscode';
import { extInstallTaskName, func, hostStartCommand, hostStartTaskName, packageJsonFileName, type ProjectLanguage } from '../../../constants';
import { getFuncWatchProblemMatcher } from '../../../vsCodeConfig/settings';
import { convertToFunctionsTaskLabel } from '../../../vsCodeConfig/tasks';
import { type IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { JavaScriptInitVSCodeStep } from "./JavaScriptInitVSCodeStep";

const npmPruneTaskLabel: string = convertToFunctionsTaskLabel('npm prune');
const npmInstallTaskLabel: string = convertToFunctionsTaskLabel('npm install');
const npmBuildTaskLabel: string = convertToFunctionsTaskLabel('npm build');
const npmWatchTaskLabel: string = convertToFunctionsTaskLabel('npm watch');
const npmCleanTaskLabel: string = convertToFunctionsTaskLabel('npm clean');

export class TypeScriptInitVSCodeStep extends JavaScriptInitVSCodeStep {
    public readonly preDeployTask: string = npmPruneTaskLabel;
    private hasCleanScript = false;

    protected async executeCore(context: IProjectWizardContext): Promise<void> {
        await super.executeCore(context);

        try {
            const packageJson = await AzExtFsExtra.readJSON<{ scripts: Record<string, string> }>(path.join(context.projectPath, packageJsonFileName));
            this.hasCleanScript = !!packageJson.scripts.clean;
        } catch {
            // ignore
        }
    }

    public getTasks(language: ProjectLanguage): TaskDefinition[] {
        const installDependsOn = this.useFuncExtensionsInstall ? [extInstallTaskName, npmInstallTaskLabel] : npmInstallTaskLabel;
        const tasks: TaskDefinition[] = [
            {
                type: func,
                label: hostStartTaskName,
                command: hostStartCommand,
                problemMatcher: getFuncWatchProblemMatcher(language),
                isBackground: true,
                dependsOn: npmWatchTaskLabel
            },
            {
                type: 'shell',
                label: npmBuildTaskLabel,
                command: 'npm run build',
                dependsOn: this.hasCleanScript ? npmCleanTaskLabel : installDependsOn,
                problemMatcher: '$tsc'
            },
            {
                type: 'shell',
                label: npmWatchTaskLabel,
                command: 'npm run watch',
                dependsOn: this.hasCleanScript ? npmCleanTaskLabel : installDependsOn,
                problemMatcher: "$tsc-watch",
                group: {
                    kind: "build",
                    isDefault: true
                },
                isBackground: true
            },
            {
                type: 'shell',
                label: npmInstallTaskLabel,
                command: 'npm install'
            },
            {
                type: 'shell',
                label: npmPruneTaskLabel,
                command: 'npm prune --production',
                dependsOn: npmBuildTaskLabel,
                problemMatcher: []
            }
        ];

        if (this.hasCleanScript) {
            tasks.push({
                type: 'shell',
                label: npmCleanTaskLabel,
                command: 'npm run clean',
                dependsOn: installDependsOn,
            });
        }

        return tasks;
    }
}
