/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import { TaskDefinition } from 'vscode';
import { extInstallTaskName, func, funcWatchProblemMatcher, hostStartCommand, ProjectRuntime } from '../../../constants';
import { getLocalFuncCoreToolsVersion } from '../../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

/**
 * Base class for all projects based on a simple script (i.e. JavaScript, C# Script, Bash, etc.) that don't require compilation
 */
export class ScriptInitVSCodeStep extends InitVSCodeStepBase {
    protected requiresFuncExtensionsInstall: boolean = false;

    protected getTasks(): TaskDefinition[] {
        return [
            {
                type: func,
                command: hostStartCommand,
                problemMatcher: funcWatchProblemMatcher,
                dependsOn: this.requiresFuncExtensionsInstall ? extInstallTaskName : undefined,
                isBackground: true
            }
        ];
    }

    protected async executeCore(wizardContext: IProjectWizardContext): Promise<void> {
        if (wizardContext.runtime === ProjectRuntime.v2) {
            try {
                const currentVersion: string | null = await getLocalFuncCoreToolsVersion();
                // Starting after this version, projects can use extension bundle instead of running "func extensions install"
                this.requiresFuncExtensionsInstall = !!currentVersion && semver.lte(currentVersion, '2.5.553');
            } catch {
                // use default of false
            }
        }

        if (this.requiresFuncExtensionsInstall) {
            // "func extensions install" task creates C# build artifacts that should be hidden
            // See issue: https://github.com/Microsoft/vscode-azurefunctions/pull/699
            this.settings.push({ prefix: 'files', key: 'exclude', value: { obj: true, bin: true } });

            if (!this.preDeployTask) {
                this.preDeployTask = extInstallTaskName;
            }
        }

        this.setDeploySubpath(wizardContext, '.');
    }
}
