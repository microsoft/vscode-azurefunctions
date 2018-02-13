/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as opn from 'opn';
import * as path from 'path';
import { SemVer } from 'semver';
import * as vscode from 'vscode';
import { OutputChannel } from 'vscode';
import { parseError, TelemetryProperties } from 'vscode-azureextensionui';
import { DialogResponses } from '../../DialogResponses';
import { IUserInterface } from '../../IUserInterface';
import { localize } from "../../localize";
import { getFuncExtensionSetting, ProjectRuntime, TemplateFilter, updateGlobalSetting } from '../../ProjectSettings';
import { cpUtils } from '../../utils/cpUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { funcHostTaskId, IProjectCreator } from './IProjectCreator';

export class CSharpProjectCreator implements IProjectCreator {
    public deploySubpath: string;
    public runtime: ProjectRuntime;
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;

    private _outputChannel: OutputChannel;
    private _ui: IUserInterface;
    private _telemetryProperties: TelemetryProperties;

    constructor(outputChannel: OutputChannel, ui: IUserInterface, telemetryProperties: TelemetryProperties) {
        this._outputChannel = outputChannel;
        this._ui = ui;
        this._telemetryProperties = telemetryProperties;
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

        await this.validateFuncSdkVersion(csprojPath, csprojContents);

        const matches: RegExpMatchArray | null = csprojContents.match(/<TargetFramework>(.*)<\/TargetFramework>/);
        if (matches === null || matches.length < 1) {
            throw new Error(localize('unrecognizedTargetFramework', 'Unrecognized target framework in project file "{0}".', csProjName));
        } else {
            const targetFramework: string = matches[1];
            this._telemetryProperties.cSharpTargetFramework = targetFramework;
            if (targetFramework.startsWith('netstandard')) {
                this.runtime = ProjectRuntime.beta;
            } else {
                this.runtime = ProjectRuntime.one;
                const settingKey: string = 'show64BitWarning';
                if (getFuncExtensionSetting<boolean>(settingKey)) {
                    const message: string = localize('64BitWarning', 'In order to debug .NET Framework functions in VS Code, you must install a 64-bit version of the Azure Functions Core Tools.');
                    const result: vscode.MessageItem | undefined = await vscode.window.showWarningMessage(message, DialogResponses.seeMoreInfo, DialogResponses.dontWarnAgain);
                    if (result === DialogResponses.seeMoreInfo) {
                        // tslint:disable-next-line:no-unsafe-any
                        opn('https://aka.ms/azFunc64bit');
                    } else if (result === DialogResponses.dontWarnAgain) {
                        await updateGlobalSetting(settingKey, false);
                    }
                }
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
                    name: localize('azFunc.attachToNetCoreFunc', "Attach to C# Functions"),
                    type: this.runtime === ProjectRuntime.beta ? 'coreclr' : 'clr',
                    request: 'attach',
                    processId: '\${command:azureFunctions.pickProcess}'
                }
            ]
        };
    }

    public getRecommendedExtensions(): string[] {
        return ['ms-vscode.csharp'];
    }

    /**
     * Validates the project has the minimum Functions SDK version that works on all OS's
     * See this bug for more info: https://github.com/Microsoft/vscode-azurefunctions/issues/164
     */
    private async validateFuncSdkVersion(csprojPath: string, csprojContents: string): Promise<void> {
        try {
            const minVersion: string = '1.0.8';
            const lineMatches: RegExpMatchArray | null = /^.*Microsoft\.NET\.Sdk\.Functions.*$/gm.exec(csprojContents);
            if (lineMatches !== null && lineMatches.length > 0) {
                const line: string = lineMatches[0];
                const versionMatches: RegExpMatchArray | null = /Version=(?:"([^"]+)"|'([^']+)')/g.exec(line);
                if (versionMatches !== null && versionMatches.length > 2) {
                    const version: SemVer = new SemVer(versionMatches[1] || versionMatches[2]);
                    this._telemetryProperties.cSharpFuncSdkVersion = version.raw;
                    if (version.compare(minVersion) < 0) {
                        const newContents: string = csprojContents.replace(line, line.replace(version.raw, minVersion));
                        await fse.writeFile(csprojPath, newContents);
                    }
                }
            }
        } catch (err) {
            this._telemetryProperties.cSharpFuncSdkError = parseError(err).message;
            // ignore errors and assume the version of the templates installed on the user's machine works for them
        }
    }
}
