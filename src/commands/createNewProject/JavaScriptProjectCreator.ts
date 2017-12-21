/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "../../localize";
import { ProjectRuntime } from "../../ProjectSettings";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export class JavaScriptProjectCreator extends ScriptProjectCreatorBase {
    public getRuntime(): ProjectRuntime {
        return ProjectRuntime.one;
    }

    public getTasksJson(launchTaskId: string, funcProblemMatcher: {}): {} {
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: localize('azFunc.launchFuncApp', 'Launch Function App'),
                    identifier: launchTaskId,
                    type: 'shell',
                    command: 'func host start',
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: [
                        funcProblemMatcher
                    ]
                }
            ]
        };
    }

    public getLaunchJson(launchTaskId: string): {} {
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToJavaScriptFunc', 'Attach to JavaScript Functions'),
                    type: 'node',
                    request: 'attach',
                    port: 5858,
                    protocol: 'inspector',
                    preLaunchTask: launchTaskId
                }
            ]
        };
    }
}
