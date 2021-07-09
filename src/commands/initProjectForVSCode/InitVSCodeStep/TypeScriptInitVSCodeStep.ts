/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskDefinition } from 'vscode';
import { extInstallTaskName, func, hostStartCommand, ProjectLanguage } from '../../../constants';
import { getFuncWatchProblemMatcher } from '../../../vsCodeConfig/settings';
import { convertToFunctionsTaskLabel } from '../../../vsCodeConfig/tasks';
import { JavaScriptInitVSCodeStep } from "./JavaScriptInitVSCodeStep";

const npmPruneTaskLabel: string = convertToFunctionsTaskLabel('npm prune');
const npmInstallTaskLabel: string = convertToFunctionsTaskLabel('npm install');
const npmBuildTaskLabel: string = convertToFunctionsTaskLabel('npm build');

export class TypeScriptInitVSCodeStep extends JavaScriptInitVSCodeStep {
    public readonly preDeployTask: string = npmPruneTaskLabel;

    public getTasks(language: ProjectLanguage): TaskDefinition[] {
        return [
            {
                type: func,
                command: hostStartCommand,
                problemMatcher: getFuncWatchProblemMatcher(language),
                isBackground: true,
                dependsOn: npmBuildTaskLabel
            },
            {
                type: 'shell',
                label: npmBuildTaskLabel,
                command: 'npm run build',
                dependsOn: this.useFuncExtensionsInstall ? [extInstallTaskName, npmInstallTaskLabel] : npmInstallTaskLabel,
                problemMatcher: '$tsc'
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
    }
}
