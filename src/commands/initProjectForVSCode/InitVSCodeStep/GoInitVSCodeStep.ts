/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DebugConfiguration, type TaskDefinition } from 'vscode';
import { func, hostStartCommand, hostStartTaskName, packTaskName, remoteBuildSetting, type ProjectLanguage } from '../../../constants';
import { goDebugConfig } from '../../../debug/GoDebugProvider';
import { getFuncWatchProblemMatcher } from '../../../vsCodeConfig/settings';
import { type IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';
import { ensureGitIgnoreContents } from './PythonInitVSCodeStep';

export class GoInitVSCodeStep extends InitVSCodeStepBase {
    stepName: string = 'GoInitVSCodeStep';
    protected preDeployTask: string = packTaskName;

    protected async executeCore(context: IProjectWizardContext): Promise<void> {
        const zipFileName: string = context.projectPath.split(/[\\/]/).pop() + '.zip';
        this.setDeploySubpath(context, zipFileName);
        this.settings.push({ key: remoteBuildSetting, value: false });
        await ensureGitIgnoreContents(context.projectPath, [zipFileName]);
    }

    protected getTasks(language: ProjectLanguage): TaskDefinition[] {
        return [
            {
                type: func,
                label: hostStartTaskName,
                command: hostStartCommand,
                problemMatcher: getFuncWatchProblemMatcher(language),
                isBackground: true,
            },
        ];
    }

    protected getDebugConfiguration(): DebugConfiguration {
        return goDebugConfig;
    }

    protected getRecommendedExtensions(): string[] {
        return ['golang.go'];
    }
}
