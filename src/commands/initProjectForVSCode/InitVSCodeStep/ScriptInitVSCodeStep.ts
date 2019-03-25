/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskDefinition } from 'vscode';
import { extInstallTaskName, func, funcWatchProblemMatcher, hostStartCommand, ProjectRuntime } from '../../../constants';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

/**
 * Base class for all projects based on a simple script (i.e. JavaScript, C# Script, Bash, etc.) that don't require compilation
 */
export class ScriptInitVSCodeStep extends InitVSCodeStepBase {
    // "func extensions install" task creates C# build artifacts that should be hidden
    // See issue: https://github.com/Microsoft/vscode-azurefunctions/pull/699
    protected readonly excludedFiles: string[] = ['obj', 'bin'];

    protected getTasks(runtime: ProjectRuntime): TaskDefinition[] {
        return [
            {
                type: func,
                command: hostStartCommand,
                problemMatcher: funcWatchProblemMatcher,
                dependsOn: runtime === ProjectRuntime.v1 ? undefined : extInstallTaskName,
                isBackground: true
            }
        ];
    }

    protected async executeCore(wizardContext: IProjectWizardContext): Promise<void> {
        this.setDeploySubpath(wizardContext, '.');
        if (!this.preDeployTask) {
            if (wizardContext.runtime !== ProjectRuntime.v1) {
                this.preDeployTask = extInstallTaskName;
            }
        }
    }
}
