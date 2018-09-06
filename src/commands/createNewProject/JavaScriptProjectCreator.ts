/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { installExtensionsId, ProjectRuntime, TemplateFilter } from "../../constants";
import { localize } from "../../localize";
import { funcHostProblemMatcher, funcHostTaskId, funcHostTaskLabel } from "./IProjectCreator";
import { ITaskOptions } from "./ITasksJson";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export const funcNodeDebugArgs: string = '--inspect=5858';
export const funcNodeDebugEnvVar: string = 'languageWorkers:node:arguments';

export class JavaScriptProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;

    public readonly functionsWorkerRuntime: string | undefined = 'node';
    public preDeployTask: string = installExtensionsId;

    public getLaunchJson(): {} {
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToJavaScriptFunc', 'Attach to JavaScript Functions'),
                    type: 'node',
                    request: 'attach',
                    port: 5858,
                    protocol: 'inspector',
                    preLaunchTask: funcHostTaskId
                }
            ]
        };
    }

    public getTasksJson(runtime: string): {} {
        let options: ITaskOptions | undefined;
        if (runtime !== ProjectRuntime.one) {
            options = {};
            options.env = {};
            options.env[funcNodeDebugEnvVar] = funcNodeDebugArgs;
        }

        return {
            version: '2.0.0',
            tasks: [
                {
                    label: funcHostTaskLabel,
                    identifier: funcHostTaskId,
                    type: 'shell',
                    command: 'func host start',
                    options: options,
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: [
                        funcHostProblemMatcher
                    ],
                    dependsOn: installExtensionsId
                },
                {
                    label: installExtensionsId, // Until this is fixed, the label must be the same as the id: https://github.com/Microsoft/vscode/issues/57707
                    identifier: installExtensionsId,
                    command: 'func extensions install',
                    type: 'shell',
                    presentation: {
                        reveal: 'always'
                    }
                }
            ]
        };
    }
}
