/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { installExtensionsId, ProjectRuntime, TemplateFilter } from "../../constants";
import { funcHostCommand, funcHostTaskLabel } from "../../funcCoreTools/funcHostTask";
import { localize } from "../../localize";
import { funcWatchProblemMatcher } from "./IProjectCreator";
import { ITaskOptions } from "./ITasksJson";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export const funcNodeDebugArgs: string = '--inspect=5858';
export const funcNodeDebugEnvVar: string = 'languageWorkers:node:arguments';

export class JavaScriptProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    public readonly deploySubpath: string = '.';

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

    public getTasksJson(runtime: string): {} {
        let options: ITaskOptions | undefined;
        // tslint:disable-next-line:no-any
        const funcTask: any = {
            label: funcHostTaskLabel,
            type: 'shell',
            command: funcHostCommand,
            isBackground: true,
            presentation: {
                reveal: 'always'
            },
            problemMatcher: funcWatchProblemMatcher
        };

        const installExtensionsTask: {} = {
            label: installExtensionsId,
            command: 'func extensions install',
            type: 'shell',
            presentation: {
                reveal: 'always'
            }
        };

        // tslint:disable-next-line:no-unsafe-any
        const tasks: {}[] = [funcTask];

        if (runtime !== ProjectRuntime.v1) {
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
