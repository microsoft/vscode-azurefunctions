/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OutputChannel } from 'vscode';
import { localize } from "../../localize";
import { ProjectRuntime } from '../../ProjectSettings';
import { cpUtils } from '../../utils/cpUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { funcHostProblemMatcher, funcHostTaskId, IProjectCreator } from './IProjectCreator';

export class CSharpProjectCreator implements IProjectCreator {
    private _outputChannel: OutputChannel;

    constructor(outputChannel: OutputChannel) {
        this._outputChannel = outputChannel;
    }

    public async addNonVSCodeFiles(functionAppPath: string): Promise<void> {
        await dotnetUtils.validateTemplatesInstalled(this._outputChannel, functionAppPath);
        await cpUtils.executeCommand(
            this._outputChannel,
            functionAppPath,
            'dotnet',
            'new',
            dotnetUtils.funcProjectId
        );
    }

    public getRuntime(): ProjectRuntime {
        return ProjectRuntime.beta;
    }

    public getTasksJson(): {} {
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: 'build',
                    command: 'dotnet build',
                    type: 'shell',
                    group: {
                        kind: 'build',
                        isDefault: true
                    },
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: '$msCompile'
                },
                {
                    label: localize('azFunc.runFuncHost', 'Run Functions Host'),
                    identifier: funcHostTaskId,
                    type: 'shell',
                    dependsOn: 'build',
                    options: {
                        cwd: '\${workspaceFolder}/bin/Debug/netstandard2.0'
                    },
                    command: 'func host start',
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: [
                        funcHostProblemMatcher
                    ]
                }
            ]
        };
    }

    public getLaunchJson(): {} {
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToNetCoreFunc', "Attach to .NET Core Functions"),
                    type: 'coreclr',
                    request: 'attach',
                    processId: '\${command:azureFunctions.pickProcess}',
                    preLaunchTask: 'build'
                }
            ]
        };
    }

    public getRecommendedExtensions(): string[] {
        return ['ms-vscode.csharp'];
    }
}
