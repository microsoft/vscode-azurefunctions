/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as semver from 'semver';
import { type TaskDefinition } from 'vscode';
import { extensionsCsprojFileName, extInstallTaskName, func, hostStartCommand, hostStartTaskName, type ProjectLanguage } from '../../../constants';
import { getLocalFuncCoreToolsVersion } from '../../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { FuncVersion } from '../../../FuncVersion';
import { getFuncWatchProblemMatcher } from '../../../vsCodeConfig/settings';
import { type IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

/**
 * Base class for all projects based on a simple script (i.e. JavaScript, C# Script, Bash, etc.) that don't require compilation
 */
export class ScriptInitVSCodeStep extends InitVSCodeStepBase {
    stepName: string = 'ScriptInitVSCodeStep';
    protected useFuncExtensionsInstall: boolean = false;

    protected getTasks(language: ProjectLanguage): TaskDefinition[] {
        return [
            {
                type: func,
                label: hostStartTaskName,
                command: hostStartCommand,
                problemMatcher: getFuncWatchProblemMatcher(language),
                dependsOn: this.useFuncExtensionsInstall ? extInstallTaskName : undefined,
                isBackground: true
            }
        ];
    }

    protected async executeCore(context: IProjectWizardContext): Promise<void> {
        try {
            const extensionsCsprojPath: string = path.join(context.projectPath, extensionsCsprojFileName);
            if (await AzExtFsExtra.pathExists(extensionsCsprojPath)) {
                this.useFuncExtensionsInstall = true;
                context.telemetry.properties.hasExtensionsCsproj = 'true';
            } else if (context.version === FuncVersion.v2) { // no need to check v1 or v3+
                const currentVersion: string | null = await getLocalFuncCoreToolsVersion(context, context.workspacePath);
                // Starting after this version, projects can use extension bundle instead of running "func extensions install"
                this.useFuncExtensionsInstall = !!currentVersion && semver.lte(currentVersion, '2.5.553');
            }
        } catch {
            // use default of false
        }

        if (this.useFuncExtensionsInstall) {
            // "func extensions install" task creates C# build artifacts that should be hidden
            // See issue: https://github.com/Microsoft/vscode-azurefunctions/pull/699
            this.settings.push({ prefix: 'files', key: 'exclude', value: { obj: true, bin: true } });

            if (!this.preDeployTask) {
                this.preDeployTask = extInstallTaskName;
            }
        }

        this.setDeploySubpath(context, '.');
    }
}
