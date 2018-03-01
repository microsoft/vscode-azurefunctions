/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "../../localize";
import { TemplateFilter } from "../../ProjectSettings";
import { funcHostTaskId, funcHostTaskLabel } from "./IProjectCreator";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export class CSharpScriptProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Core;

    public getTasksJson(): {} {
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: funcHostTaskLabel,
                    identifier: funcHostTaskId,
                    type: 'shell',
                    command: 'func host start',
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: []
                }
            ]
        };
    }

    public getLaunchJson(): {} {
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToNetCoreFunc', "Attach to C# Script Functions"),
                    type: 'coreclr',
                    request: 'attach',
                    processId: '\${command:azureFunctions.pickProcess}'
                }
            ]
        };
    }

    public getRecommendedExtensions(): string[] {
        return super.getRecommendedExtensions().concat(['ms-vscode.csharp']);
    }
}
