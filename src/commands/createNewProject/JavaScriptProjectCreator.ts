/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "../../localize";
import { ProjectRuntime, TemplateFilter } from "../../ProjectSettings";
import { funcHostTaskId } from "./IProjectCreator";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export class JavaScriptProjectCreator extends ScriptProjectCreatorBase {
    public static defaultRuntime: ProjectRuntime = ProjectRuntime.one;
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;

    public async getRuntime(): Promise<ProjectRuntime> {
        // Always use projectruntime.one for JavaScript since it has more templates and there were no major changes across runtime
        return JavaScriptProjectCreator.defaultRuntime;
    }

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
}
