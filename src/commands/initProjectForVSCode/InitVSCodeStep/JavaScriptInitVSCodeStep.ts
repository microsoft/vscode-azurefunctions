/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { DebugConfiguration, TaskDefinition } from "vscode";
import { extInstallTaskName, func, funcWatchProblemMatcher, hostStartCommand } from "../../../constants";
import { nodeDebugConfig } from "../../../debug/NodeDebugProvider";
import { IProjectWizardContext } from "../../createNewProject/IProjectWizardContext";
import { ScriptInitVSCodeStep } from './ScriptInitVSCodeStep';

const npmInstallTaskLabel: string = 'npm install';
const npmPruneTaskLabel: string = 'npm prune';

export class JavaScriptInitVSCodeStep extends ScriptInitVSCodeStep {
    private hasPackageJson: boolean;

    protected async executeCore(context: IProjectWizardContext): Promise<void> {
        await super.executeCore(context);

        this.hasPackageJson = await fse.pathExists(path.join(context.projectPath, 'package.json'));
        if (this.hasPackageJson) {
            this.preDeployTask = npmPruneTaskLabel;
            this.settings.push({ key: 'postDeployTask', value: npmInstallTaskLabel });
        }
    }

    protected getDebugConfiguration(): DebugConfiguration {
        return nodeDebugConfig;
    }

    protected getTasks(): TaskDefinition[] {
        if (!this.hasPackageJson) {
            return super.getTasks();
        } else {
            return [
                {
                    type: func,
                    command: hostStartCommand,
                    problemMatcher: funcWatchProblemMatcher,
                    isBackground: true,
                    dependsOn: this.useFuncExtensionsInstall ? [extInstallTaskName, npmInstallTaskLabel] : npmInstallTaskLabel
                },
                {
                    type: 'shell',
                    label: npmInstallTaskLabel,
                    command: 'npm install'
                },
                {
                    type: 'shell',
                    label: npmPruneTaskLabel,
                    command: 'npm prune --production', // This removes dev dependencies, but importantly also installs prod dependencies
                    dependsOn: this.useFuncExtensionsInstall ? extInstallTaskName : undefined,
                    problemMatcher: []
                }
            ];
        }
    }
}
