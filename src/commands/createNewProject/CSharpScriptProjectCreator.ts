/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TemplateFilter } from "../../constants";
import { funcHostCommand, funcHostTaskLabel } from "../../funcCoreTools/funcHostTask";
import { localize } from "../../localize";
import { funcWatchProblemMatcher } from "./IProjectCreator";
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export class CSharpScriptProjectCreator extends ScriptProjectCreatorBase {
    public readonly templateFilter: TemplateFilter = TemplateFilter.Core;

    public getTasksJson(): {} {
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: funcHostTaskLabel,
                    type: 'shell',
                    command: funcHostCommand,
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: funcWatchProblemMatcher
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
