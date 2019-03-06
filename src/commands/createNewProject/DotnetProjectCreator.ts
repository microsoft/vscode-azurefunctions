/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { SemVer } from 'semver';
import * as vscode from 'vscode';
import { DialogResponses, parseError } from 'vscode-azureextensionui';
import { dotnetPublishTaskLabel, func, funcWatchProblemMatcher, gitignoreFileName, hostFileName, hostStartCommand, isWindows, localSettingsFileName, ProjectLanguage, ProjectRuntime, TemplateFilter } from '../../constants';
import { ext } from '../../extensionVariables';
import { tryGetLocalRuntimeVersion } from '../../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from "../../localize";
import { getFuncExtensionSetting, promptForProjectRuntime, updateGlobalSetting } from '../../ProjectSettings';
import { executeDotnetTemplateCommand } from '../../templates/executeDotnetTemplateCommand';
import { cpUtils } from '../../utils/cpUtils';
import { dotnetUtils } from '../../utils/dotnetUtils';
import { openUrl } from '../../utils/openUrl';
import { ProjectCreatorBase } from './ProjectCreatorBase';

export class DotnetProjectCreator extends ProjectCreatorBase {
    public deploySubpath: string;
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;
    public preDeployTask: string = dotnetPublishTaskLabel;

    private _debugSubpath: string;

    private get _projectExtension(): string {
        return this.language === ProjectLanguage.FSharp ? '.fsproj' : '.csproj';
    }

    public async onCreateNewProject(): Promise<void> {
        await dotnetUtils.validateDotnetInstalled(this.actionContext);

        const projectName: string = path.basename(this.functionAppPath);
        const projName: string = projectName + this._projectExtension;
        await this.confirmOverwriteExisting(this.functionAppPath, projName);

        // tslint:disable-next-line:strict-boolean-expressions
        this.runtime = this.runtime || await tryGetLocalRuntimeVersion() || await promptForProjectRuntime();
        const templateLanguage: string = this.language === ProjectLanguage.FSharp ? 'FSharp' : 'CSharp';
        const identity: string = `Microsoft.AzureFunctions.ProjectTemplate.${templateLanguage}.${this.runtime === ProjectRuntime.v1 ? '1' : '2'}.x`;
        const functionsVersion: string = this.runtime === ProjectRuntime.v1 ? 'v1' : 'v2';
        await executeDotnetTemplateCommand(this.runtime, this.functionAppPath, 'create', '--identity', identity, '--arg:name', cpUtils.wrapArgInQuotes(projectName), '--arg:AzureFunctionsVersion', functionsVersion);
    }

    public getTasksJson(): {} {
        return {
            version: '2.0.0',
            tasks: [
                {
                    label: 'clean',
                    command: 'dotnet clean',
                    type: 'shell',
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
                    problemMatcher: '$msCompile'
                },
                {
                    label: 'clean release',
                    command: 'dotnet clean --configuration Release',
                    type: 'shell',
                    problemMatcher: '$msCompile'
                },
                {
                    label: dotnetPublishTaskLabel,
                    command: 'dotnet publish --configuration Release',
                    type: 'shell',
                    dependsOn: 'clean release',
                    problemMatcher: '$msCompile'
                },
                {
                    type: func,
                    dependsOn: 'build',
                    options: {
                        cwd: `\${workspaceFolder}/${this._debugSubpath}`
                    },
                    command: hostStartCommand,
                    isBackground: true,
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
                    name: localize('attachToNetFunc', "Attach to .NET Functions"),
                    type: this.runtime === ProjectRuntime.v2 ? 'coreclr' : 'clr',
                    request: 'attach',
                    processId: '\${command:azureFunctions.pickProcess}'
                }
            ]
        };
    }

    public getRecommendedExtensions(): string[] {
        // The csharp extension is really a 'dotnet' extension because it provides debugging for both
        const recs: string[] = super.getRecommendedExtensions().concat(['ms-vscode.csharp']);

        if (this.language === ProjectLanguage.FSharp) {
            recs.push('ionide.ionide-fsharp');
        }

        return recs;
    }

    /**
     * Detects the runtime based on the targetFramework from the proj file
     * Also performs a few validations and sets a few properties based on that targetFramework
     */
    public async onInitProjectForVSCode(): Promise<void> {
        const projName: string | undefined = this.language === ProjectLanguage.FSharp ? await tryGetFsprojFile(this.functionAppPath) : await tryGetCsprojFile(this.functionAppPath);
        if (!projName) {
            throw new Error(localize('projNotFound', 'Expected to find a single "{0}" file in folder "{1}", but found zero or multiple instead.', this._projectExtension, path.basename(this.functionAppPath)));
        }

        const projPath: string = path.join(this.functionAppPath, projName);
        const projContents: string = (await fse.readFile(projPath)).toString();

        await this.validateFuncSdkVersion(projPath, projContents);

        const matches: RegExpMatchArray | null = projContents.match(/<TargetFramework>(.*)<\/TargetFramework>/);
        if (matches === null || matches.length < 1) {
            throw new Error(localize('unrecognizedTargetFramework', 'Unrecognized target framework in project file "{0}".', projName));
        } else {
            const targetFramework: string = matches[1];
            this.actionContext.properties.dotnetTargetFramework = targetFramework;
            if (/net(standard|core)/i.test(targetFramework)) {
                this.runtime = ProjectRuntime.v2;
            } else {
                this.runtime = ProjectRuntime.v1;
                const settingKey: string = 'show64BitWarning';
                if (getFuncExtensionSetting<boolean>(settingKey)) {
                    const message: string = localize('64BitWarning', 'In order to debug .NET Framework functions in VS Code, you must install a 64-bit version of the Azure Functions Core Tools.');
                    try {
                        const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
                        if (result === DialogResponses.learnMore) {
                            await openUrl('https://aka.ms/azFunc64bit');
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
    }

    /**
     * Validates the project has the minimum Functions SDK version that works on all OS's
     * See this bug for more info: https://github.com/Microsoft/vscode-azurefunctions/issues/164
     */
    private async validateFuncSdkVersion(projPath: string, projContents: string): Promise<void> {
        if (!isWindows) { // No need to validate on Windows - it should work with previous versions
            try {
                const minVersion: string = '1.0.8';
                const lineMatches: RegExpMatchArray | null = /^.*Microsoft\.NET\.Sdk\.Functions.*$/gm.exec(projContents);
                if (lineMatches !== null && lineMatches.length > 0) {
                    const line: string = lineMatches[0];
                    const versionMatches: RegExpMatchArray | null = /Version=(?:"([^"]+)"|'([^']+)')/g.exec(line);
                    if (versionMatches !== null && versionMatches.length > 2) {
                        const version: SemVer = new SemVer(versionMatches[1] || versionMatches[2]);
                        this.actionContext.properties.dotnetFuncSdkVersion = version.raw;
                        if (version.compare(minVersion) < 0) {
                            const newContents: string = projContents.replace(line, line.replace(version.raw, minVersion));
                            await fse.writeFile(projPath, newContents);
                        }
                    }
                }
            } catch (err) {
                this.actionContext.properties.dotnetFuncSdkError = parseError(err).message;
                // ignore errors and assume the version of the templates installed on the user's machine works for them
            }
        }
    }

    private async confirmOverwriteExisting(functionAppPath: string, projName: string): Promise<boolean> {
        const filesToCheck: string[] = [projName, gitignoreFileName, localSettingsFileName, hostFileName];
        const existingFiles: string[] = [];
        for (const fileName of filesToCheck) {
            if (await fse.pathExists(path.join(functionAppPath, fileName))) {
                existingFiles.push(fileName);
            }
        }

        if (existingFiles.length > 0) {
            await ext.ui.showWarningMessage(localize('overwriteExistingFiles', 'Overwrite existing files?: {0}', existingFiles.join(', ')), { modal: true }, DialogResponses.yes, DialogResponses.cancel);
            return true;
        } else {
            return false;
        }
    }
}

export async function tryGetCsprojFile(functionAppPath: string): Promise<string | undefined> {
    return await tryGetProjFile(functionAppPath, /\.csproj$/i);
}

export async function tryGetFsprojFile(functionAppPath: string): Promise<string | undefined> {
    return await tryGetProjFile(functionAppPath, /\.fsproj$/i);
}

/**
 * If a single proj file is found at the root of this folder, returns the path to that file. Otherwise returns undefined
 * NOTE: 'extensions.csproj' is excluded as it has special meaning for the func cli
 */
async function tryGetProjFile(functionAppPath: string, regexp: RegExp): Promise<string | undefined> {
    const files: string[] = await fse.readdir(functionAppPath);
    const projectFiles: string[] = files.filter((f: string) => regexp.test(f) && !/extensions\.csproj$/i.test(f));
    return projectFiles.length === 1 ? projectFiles[0] : undefined;
}
