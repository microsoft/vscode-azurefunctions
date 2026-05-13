/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DebugConfiguration, type TaskDefinition } from 'vscode';
import { func, hostStartCommand, hostStartTaskName, type ProjectLanguage } from '../../../constants';
import { getFuncWatchProblemMatcher } from '../../../vsCodeConfig/settings';
import { type IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

// Default Delve DAP port used by GoDebugProvider. Inlined here so PR 1 is self-contained;
// PR 2 will introduce GoDebugProvider and may re-export this config.
export const goDebugConfig: DebugConfiguration = {
    name: 'Attach to Go Functions',
    type: 'go',
    request: 'attach',
    mode: 'remote',
    port: 2345,
    host: '127.0.0.1',
    preLaunchTask: hostStartTaskName,
};

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
