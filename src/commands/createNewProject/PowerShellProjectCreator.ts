/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extInstallTaskName, func, funcWatchProblemMatcher, hostStartCommand, ProjectRuntime, TemplateFilter } from "../../constants";
import { powershellDebugConfig } from "../../debug/PowerShellDebugProvider";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export class PowerShellProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.All;
    public readonly deploySubpath: string = '.';

    // "func extensions install" task creates C# build artifacts that should be hidden
    // See issue: https://github.com/Microsoft/vscode-azurefunctions/pull/699
    public readonly excludedFiles: string | string[] = ['obj', 'bin'];

    public readonly functionsWorkerRuntime: string | undefined = 'powershell';

    public getLaunchJson(): {} {
        return {
            version: '0.2.0',
            configurations: [powershellDebugConfig]
        };
    }

    public getTasksJson(): {} {
        // tslint:disable-next-line:no-any
        const funcTask: any = {
            type: func,
            command: hostStartCommand,
            problemMatcher: funcWatchProblemMatcher,
            isBackground: true
        };

        // tslint:disable-next-line:no-unsafe-any
        const tasks: {}[] = [funcTask];

        if (this.runtime !== ProjectRuntime.v1) {
            // tslint:disable-next-line:no-unsafe-any
            funcTask.dependsOn = extInstallTaskName;
            this.preDeployTask = extInstallTaskName;
        }

        return {
            version: '2.0.0',
            tasks: tasks
        };
    }

    public getRecommendedExtensions(): string[] {
        return super.getRecommendedExtensions().concat(['ms-vscode.PowerShell']);
    }
}
