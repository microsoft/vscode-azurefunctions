/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
// tslint:disable-next-line:no-require-imports
import opn = require("opn");
import * as path from 'path';
import { SemVer } from 'semver';
import * as vscode from 'vscode';
import { DialogResponses, parseError } from 'vscode-azureextensionui';
import { gitignoreFileName, hostFileName, isWindows, localSettingsFileName, ProjectRuntime, publishTaskId, TemplateFilter } from '../../constants';
import { funcHostCommand, funcHostTaskLabel } from '../../funcCoreTools/funcHostTask';
import { tryGetLocalRuntimeVersion } from '../../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from "../../localize";
import { getFuncExtensionSetting, promptForProjectRuntime, updateGlobalSetting } from '../../ProjectSettings';
import { executeDotnetTemplateCommand } from '../../templates/executeDotnetTemplateCommand';
import { cpUtils } from '../../utils/cpUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { funcWatchProblemMatcher, ProjectCreatorBase } from './IProjectCreator';

export class CSharpProjectCreator extends ProjectCreatorBase {
    public deploySubpath: string;
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    public preDeployTask: string = publishTaskId;

    private _debugSubpath: string;
    private _runtime: ProjectRuntime;

    private _hasDetectedRuntime: boolean = false;

    public async addNonVSCodeFiles(): Promise<void> {
        await dotnetUtils.validateDotnetInstalled();

        const projectName: string = path.basename(this.functionAppPath);
        const csProjName: string = `${projectName}.csproj`;
        await this.confirmOverwriteExisting(this.functionAppPath, csProjName);

        // tslint:disable-next-line:strict-boolean-expressions
        this._runtime = await tryGetLocalRuntimeVersion() || await promptForProjectRuntime();
        const identity: string = `Microsoft.AzureFunctions.ProjectTemplate.CSharp.${this._runtime === ProjectRuntime.v1 ? '1' : '2'}.x`;
        const functionsVersion: string = this._runtime === ProjectRuntime.v1 ? 'v1' : 'v2';
        await executeDotnetTemplateCommand(this._runtime, this.functionAppPath, 'create', '--identity', identity, '--arg:name', cpUtils.wrapArgInQuotes(projectName), '--arg:AzureFunctionsVersion', functionsVersion);

        if (!this._hasDetectedRuntime) {
            await this.detectRuntime();
        }
    }

    public async getRuntime(): Promise<ProjectRuntime> {
        if (!this._hasDetectedRuntime) {
            await this.detectRuntime();
        }

        return this._runtime;
    }

    public getTasksJson(): {} {
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: 'clean',
                    command: 'dotnet clean',
                    type: 'shell',
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: '$msCompile'
                },
                {
                    label: 'build',
                    command: 'dotnet build',
                    type: 'shell',
                    dependsOn: 'clean',
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
                    label: 'clean release',
                    command: 'dotnet clean --configuration Release',
                    type: 'shell',
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: '$msCompile'
                },
                {
                    label: publishTaskId,
                    command: 'dotnet publish --configuration Release',
                    type: 'shell',
                    dependsOn: 'clean release',
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: '$msCompile'
                },
                {
                    label: funcHostTaskLabel,
                    type: 'shell',
                    dependsOn: 'build',
                    options: {
                        cwd: `\${workspaceFolder}/${this._debugSubpath}`
                    },
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
                    name: localize('azFunc.attachToNetCoreFunc', "Attach to C# Functions"),
                    type: this._runtime === ProjectRuntime.v2 ? 'coreclr' : 'clr',
                    request: 'attach',
                    processId: '\${command:azureFunctions.pickProcess}'
                }
            ]
        };
    }

    public getRecommendedExtensions(): string[] {
        return super.getRecommendedExtensions().concat(['ms-vscode.csharp']);
    }

    /**
     * Detects the runtime based on the targetFramework from the csproj file
     * Also performs a few validations and sets a few properties based on that targetFramework
     */
    private async detectRuntime(): Promise<void> {
        const csProjName: string | undefined = await tryGetCsprojFile(this.functionAppPath);
        if (!csProjName) {
            throw new Error(localize('csprojNotFound', 'Expected to find a single "csproj" file in folder "{0}", but found zero or multiple instead.', path.basename(this.functionAppPath)));
        }

        const csprojPath: string = path.join(this.functionAppPath, csProjName);
        const csprojContents: string = (await fse.readFile(csprojPath)).toString();

        await this.validateFuncSdkVersion(csprojPath, csprojContents);

        const matches: RegExpMatchArray | null = csprojContents.match(/<TargetFramework>(.*)<\/TargetFramework>/);
        if (matches === null || matches.length < 1) {
            throw new Error(localize('unrecognizedTargetFramework', 'Unrecognized target framework in project file "{0}".', csProjName));
        } else {
            const targetFramework: string = matches[1];
            this.telemetryProperties.cSharpTargetFramework = targetFramework;
            if (targetFramework.startsWith('netstandard')) {
                this._runtime = ProjectRuntime.v2;
            } else {
                this._runtime = ProjectRuntime.v1;
                const settingKey: string = 'show64BitWarning';
                if (getFuncExtensionSetting<boolean>(settingKey)) {
                    const message: string = localize('64BitWarning', 'In order to debug .NET Framework functions in VS Code, you must install a 64-bit version of the Azure Functions Core Tools.');
                    try {
                        const result: vscode.MessageItem = await this.ui.showWarningMessage(message, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
                        if (result === DialogResponses.learnMore) {
                            await opn('https://aka.ms/azFunc64bit');
                        } else if (result === DialogResponses.dontWarnAgain) {
                            await updateGlobalSetting(settingKey, false);
                        }
                    } catch (err) {
                        // swallow cancellations (aka if they clicked the 'x' button to dismiss the warning) and proceed to create project
                        if (!parseError(err).isUserCancelledError) {
                            throw err;
                        }
                    }
                }
            }
            this.deploySubpath = `bin/Release/${targetFramework}/publish`;
            this._debugSubpath = `bin/Debug/${targetFramework}`;
        }

        this._hasDetectedRuntime = true;
    }

    /**
     * Validates the project has the minimum Functions SDK version that works on all OS's
     * See this bug for more info: https://github.com/Microsoft/vscode-azurefunctions/issues/164
     */
    private async validateFuncSdkVersion(csprojPath: string, csprojContents: string): Promise<void> {
        if (!isWindows) { // No need to validate on Windows - it should work with previous versions
            try {
                const minVersion: string = '1.0.8';
                const lineMatches: RegExpMatchArray | null = /^.*Microsoft\.NET\.Sdk\.Functions.*$/gm.exec(csprojContents);
                if (lineMatches !== null && lineMatches.length > 0) {
                    const line: string = lineMatches[0];
                    const versionMatches: RegExpMatchArray | null = /Version=(?:"([^"]+)"|'([^']+)')/g.exec(line);
                    if (versionMatches !== null && versionMatches.length > 2) {
                        const version: SemVer = new SemVer(versionMatches[1] || versionMatches[2]);
                        this.telemetryProperties.cSharpFuncSdkVersion = version.raw;
                        if (version.compare(minVersion) < 0) {
                            const newContents: string = csprojContents.replace(line, line.replace(version.raw, minVersion));
                            await fse.writeFile(csprojPath, newContents);
                        }
                    }
                }
            } catch (err) {
                this.telemetryProperties.cSharpFuncSdkError = parseError(err).message;
                // ignore errors and assume the version of the templates installed on the user's machine works for them
            }
        }
    }

    private async confirmOverwriteExisting(functionAppPath: string, csProjName: string): Promise<boolean> {
        const filesToCheck: string[] = [csProjName, gitignoreFileName, localSettingsFileName, hostFileName];
        const existingFiles: string[] = [];
        for (const fileName of filesToCheck) {
            if (await fse.pathExists(path.join(functionAppPath, fileName))) {
                existingFiles.push(fileName);
            }
        }

        if (existingFiles.length > 0) {
            await this.ui.showWarningMessage(localize('overwriteExistingFiles', 'Overwrite existing files?: {0}', existingFiles.join(', ')), { modal: true }, DialogResponses.yes, DialogResponses.cancel);
            return true;
        } else {
            return false;
        }
    }
}

/**
 * If a single csproj file is found at the root of this folder, returns the path to that file. Otherwise returns undefined
 * NOTE: 'extensions.csproj' is excluded as it has special meaning for the func cli
 */
export async function tryGetCsprojFile(functionAppPath: string): Promise<string | undefined> {
    const files: string[] = await fse.readdir(functionAppPath);
    const projectFiles: string[] = files.filter((f: string) => /\.csproj$/i.test(f) && !/extensions\.csproj$/i.test(f));
    return projectFiles.length === 1 ? projectFiles[0] : undefined;
}
