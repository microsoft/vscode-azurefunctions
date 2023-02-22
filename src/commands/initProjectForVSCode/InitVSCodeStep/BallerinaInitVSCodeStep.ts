/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskDefinition } from 'vscode';
import { func, hostStartCommand, hostStartTaskName, ProjectLanguage, projectSubpathSetting } from '../../../constants';
import { getFuncWatchProblemMatcher } from '../../../vsCodeConfig/settings';
import { convertToFunctionsTaskLabel } from '../../../vsCodeConfig/tasks';
import { IJavaProjectWizardContext } from '../../createNewProject/javaSteps/IJavaProjectWizardContext';
import { isBallerinaProject } from '../detectProjectLanguage';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

const ballerinaPackageTaskLabel: string = convertToFunctionsTaskLabel('package');

export class BallerinaInitVSCodeStep extends InitVSCodeStepBase {
    protected preDeployTask: string = ballerinaPackageTaskLabel;

    private _debugSubpath: string = "target/azure_functions";

    protected async executeCore(context: IJavaProjectWizardContext): Promise<void> {
        const isProject: boolean = await isBallerinaProject(context.projectPath);
        if (!isProject) {
            this._debugSubpath = "azure_functions";
        }

        this.setDeploySubpath(context, this._debugSubpath);
        this.settings.push({
            key: projectSubpathSetting,
            value: this._debugSubpath
        });
    }

    protected getTasks(language: ProjectLanguage): TaskDefinition[] {
        return [
            {
                type: func,
                label: hostStartTaskName,
                command: hostStartCommand,
                problemMatcher: getFuncWatchProblemMatcher(language),
                isBackground: true,
                options: {
                    cwd: this._debugSubpath
                },
                dependsOn: ballerinaPackageTaskLabel
            },
            {
                label: ballerinaPackageTaskLabel,
                command: "bal build",
                type: 'shell',
                group: {
                    kind: 'build',
                    isDefault: true
                }
            }
        ];
    }
}

