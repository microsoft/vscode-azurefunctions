/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { installExtensionsId, ProjectRuntime, TemplateFilter } from "../../constants";
import { funcHostCommand, funcHostTaskLabel } from "../../funcCoreTools/funcHostTask";
import { localize } from "../../localize";
import { ITaskOptions } from "./ITasksJson";
import { funcWatchProblemMatcher } from "./ProjectCreatorBase";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export const funcNodeDebugArgs: string = '--inspect=5858';
export const funcNodeDebugEnvVar: string = 'languageWorkers__node__arguments';

export class JavaScriptProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    public readonly deploySubpath: string = '.';
    // "func extensions install" task creates C# build artifacts that should be hidden
    // See issue: https://github.com/Microsoft/vscode-azurefunctions/pull/699
    public readonly excludedFiles: string | string[] = ['obj', 'bin'];

    public readonly functionsWorkerRuntime: string | undefined = 'node';

    public getLaunchJson(): {} {
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToJavaScriptFunc', 'Attach to JavaScript Functions'),
                    type: 'node',
                    request: 'attach',
                    port: 5858,
                    preLaunchTask: funcHostTaskLabel
                }
            ]
        };
    }

    public getTasksJson(): {} {
        let options: ITaskOptions | undefined;
        // tslint:disable-next-line:no-any
        const funcTask: any = {
            label: funcHostTaskLabel,
            type: 'shell',
            command: funcHostCommand,
            isBackground: true,
            problemMatcher: funcWatchProblemMatcher
        };

        const installExtensionsTask: {} = {
            label: installExtensionsId,
            command: 'func extensions install',
            type: 'shell'
        };

        // tslint:disable-next-line:no-unsafe-any
        const tasks: {}[] = [funcTask];

        if (this.runtime !== ProjectRuntime.v1) {
            options = {};
            options.env = {};
            options.env[funcNodeDebugEnvVar] = funcNodeDebugArgs;
            // tslint:disable-next-line:no-unsafe-any
            funcTask.options = options;

            // tslint:disable-next-line:no-unsafe-any
            funcTask.dependsOn = installExtensionsId;
            this.preDeployTask = installExtensionsId;
            tasks.push(installExtensionsTask);
        }

        return {
            version: '2.0.0',
            tasks: tasks
        };
    }
}
