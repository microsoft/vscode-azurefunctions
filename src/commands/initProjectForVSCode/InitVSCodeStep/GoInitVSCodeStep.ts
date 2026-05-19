/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DebugConfiguration, type TaskDefinition } from 'vscode';
import { func, hostStartCommand, hostStartTaskName, type ProjectLanguage } from '../../../constants';
import { goDebugConfig } from '../../../debug/GoDebugProvider';
import { getFuncWatchProblemMatcher } from '../../../vsCodeConfig/settings';
import { type IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

export class GoInitVSCodeStep extends InitVSCodeStepBase {
    stepName: string = 'GoInitVSCodeStep';

    protected async executeCore(context: IProjectWizardContext): Promise<void> {
        this.setDeploySubpath(context, '.');
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
