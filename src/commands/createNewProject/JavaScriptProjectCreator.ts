/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugConfiguration } from "vscode";
import { installExtensionsId, ProjectRuntime, TemplateFilter } from "../../constants";
import { getNodeLaunchConfiguration } from "../../debug/FuncNodeDebugConfigProvider";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export const funcNodeDebugArgs: string = '--inspect=5858';
export const funcNodeDebugEnvVar: string = 'languageWorkers:node:arguments';

export class JavaScriptProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    public readonly deploySubpath: string = '.';

    public readonly functionsWorkerRuntime: string | undefined = 'node';

    public getLaunchConfiguration(): DebugConfiguration {
        return getNodeLaunchConfiguration();
    }

    public getTasksJson(runtime: string): {} {
        // tslint:disable-next-line:no-any
        const installExtensionsTask: {} = {
            label: installExtensionsId, // Until this is fixed, the label must be the same as the id: https://github.com/Microsoft/vscode/issues/57707
            identifier: installExtensionsId,
            command: 'func extensions install',
            type: 'shell',
            presentation: {
                reveal: 'always'
            }
        };

        const tasks: {}[] = [];
        if (runtime !== ProjectRuntime.v1) {
            // tslint:disable-next-line:no-unsafe-any
            this.preDeployTask = installExtensionsId;
            tasks.push(installExtensionsTask);
        }

        return {
            version: '2.0.0',
            tasks: tasks
        };
    }
}
