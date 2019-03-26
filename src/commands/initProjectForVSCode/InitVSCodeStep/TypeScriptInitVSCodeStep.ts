/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskDefinition } from 'vscode';
import { extInstallTaskName, func, funcWatchProblemMatcher, hostStartCommand, ProjectRuntime } from '../../../constants';
import { JavaScriptInitVSCodeStep } from "./JavaScriptInitVSCodeStep";

const npmPruneTaskLabel: string = 'npm prune';
const npmInstallTaskLabel: string = 'npm install';
const npmBuildTaskLabel: string = 'npm build';

export class TypeScriptInitVSCodeStep extends JavaScriptInitVSCodeStep {
    public readonly preDeployTask: string = npmPruneTaskLabel;

    public getTasks(runtime: ProjectRuntime): TaskDefinition[] {
        return [
            {
                type: func,
                command: hostStartCommand,
                problemMatcher: funcWatchProblemMatcher,
                isBackground: true,
                dependsOn: npmBuildTaskLabel
            },
            {
                type: 'shell',
                label: npmBuildTaskLabel,
                command: 'npm run build',
                dependsOn: runtime === ProjectRuntime.v1 ? npmInstallTaskLabel : [extInstallTaskName, npmInstallTaskLabel],
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
