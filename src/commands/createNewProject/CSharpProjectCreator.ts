/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { OutputChannel } from 'vscode';
import { IUserInterface } from '../../IUserInterface';
import { localize } from "../../localize";
import { ProjectRuntime, TemplateFilter } from '../../ProjectSettings';
import { cpUtils } from '../../utils/cpUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { funcHostTaskId, IProjectCreator } from './IProjectCreator';

export class CSharpProjectCreator implements IProjectCreator {
    public deploySubpath: string;
    public runtime: ProjectRuntime;
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;

    private _outputChannel: OutputChannel;
    private _ui: IUserInterface;

    constructor(outputChannel: OutputChannel, ui: IUserInterface) {
        this._outputChannel = outputChannel;
        this._ui = ui;
    }

    public async addNonVSCodeFiles(functionAppPath: string): Promise<void> {
        await dotnetUtils.validateTemplatesInstalled(this._outputChannel, functionAppPath, this._ui);
        await cpUtils.executeCommand(
            this._outputChannel,
            functionAppPath,
            'dotnet',
            'new',
            dotnetUtils.funcProjectId
        );

        const csProjName: string = `${path.basename(functionAppPath)}.csproj`;
        const csprojPath: string = path.join(functionAppPath, csProjName);
        const csprojContents: string = (await fse.readFile(csprojPath)).toString();
        const matches: RegExpMatchArray | null = csprojContents.match(/<TargetFramework>(.*)<\/TargetFramework>/);
        if (matches === null || matches.length < 1) {
            throw new Error(localize('unrecognizedTargetFramework', 'Unrecognized target framework in project file "{0}".', csProjName));
        } else {
            const targetFramework: string = matches[1];
            if (targetFramework.startsWith('netstandard')) {
                this.runtime = ProjectRuntime.beta;
            } else {
                this.runtime = ProjectRuntime.one;
            }
            this.deploySubpath = `bin/Debug/${targetFramework}`;
        }
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
                        cwd: `\${workspaceFolder}/${this.deploySubpath}`
                    },
                    command: 'func host start',
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    }
                }
            ]
        };
    }

    public getLaunchJson(): {} {
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToNetCoreFunc', "Attach to C# Functions"),
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
