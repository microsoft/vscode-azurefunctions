/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { DebugConfiguration, MessageItem, TaskDefinition } from 'vscode';
import { DialogResponses, parseError } from 'vscode-azureextensionui';
import { dotnetPublishTaskLabel, func, funcWatchProblemMatcher, hostStartCommand, ProjectLanguage } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { FuncVersion, tryParseFuncVersion } from '../../../FuncVersion';
import { localize } from "../../../localize";
import { nonNullProp } from '../../../utils/nonNull';
import { openUrl } from '../../../utils/openUrl';
import { getWorkspaceSetting, updateGlobalSetting } from '../../../vsCodeConfig/settings';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

export class DotnetInitVSCodeStep extends InitVSCodeStepBase {
    protected preDeployTask: string = dotnetPublishTaskLabel;

    private _debugSubpath: string;

    protected getDebugConfiguration(version: FuncVersion): DebugConfiguration {
        return {
            name: localize('attachToNetFunc', "Attach to .NET Functions"),
            type: version === FuncVersion.v1 ? 'clr' : 'coreclr',
            request: 'attach',
            processId: '\${command:azureFunctions.pickProcess}'
        };
    }

    protected getRecommendedExtensions(language: ProjectLanguage): string[] {
        // The csharp extension is really a 'dotnet' extension because it provides debugging for both
        const recs: string[] = ['ms-vscode.csharp'];
        if (language === ProjectLanguage.FSharp) {
            recs.push('ionide.ionide-fsharp');
        }
        return recs;
    }

    /**
     * Detects the version based on the targetFramework from the proj file
     * Also performs a few validations and sets a few properties based on that targetFramework
     */
    protected async executeCore(context: IProjectWizardContext): Promise<void> {
        const projectPath: string = context.projectPath;
        const language: ProjectLanguage = nonNullProp(context, 'language');

        const projFileName: string | undefined = language === ProjectLanguage.FSharp ? await tryGetFsprojFile(projectPath) : await tryGetCsprojFile(projectPath);
        if (!projFileName) {
            throw new Error(localize('projNotFound', 'Expected to find a single project file in folder "{1}", but found zero or multiple instead.', path.basename(projectPath)));
        }

        const projFilePath: string = path.join(projectPath, projFileName);

        const versionInProjFile: string = await getFuncVersion(projFilePath);
        context.telemetry.properties.versionInProjFile = versionInProjFile;
        context.version = tryParseFuncVersion(versionInProjFile);
        if (context.version === undefined) {
            throw new Error(localize('unrecognizedFuncVersion', 'Unrecognized version "{0}".', versionInProjFile));
        }

        if (context.version === FuncVersion.v1) {
            const settingKey: string = 'show64BitWarning';
            if (getWorkspaceSetting<boolean>(settingKey)) {
                const message: string = localize('64BitWarning', 'In order to debug .NET Framework functions in VS Code, you must install a 64-bit version of the Azure Functions Core Tools.');
                try {
                    const result: MessageItem = await ext.ui.showWarningMessage(message, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
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

        const targetFramework: string = await getTargetFramework(projFilePath);
        this.setDeploySubpath(context, `bin/Release/${targetFramework}/publish`);
        this._debugSubpath = `bin/Debug/${targetFramework}`;
    }

    protected getTasks(): TaskDefinition[] {
        const commonArgs: string[] = ['/property:GenerateFullPaths=true', '/consoleloggerparameters:NoSummary'];
        const releaseArgs: string[] = ['--configuration', 'Release'];

        return [
            {
                label: 'clean',
                command: 'dotnet',
                args: [
                    'clean',
                    ...commonArgs
                ],
                type: 'process',
                problemMatcher: '$msCompile'
            },
            {
                label: 'build',
                command: 'dotnet',
                args: [
                    'build',
                    ...commonArgs
                ],
                type: 'process',
                dependsOn: 'clean',
                group: {
                    kind: 'build',
                    isDefault: true
                },
                problemMatcher: '$msCompile'
            },
            {
                label: 'clean release',
                command: 'dotnet',
                args: [
                    'clean',
                    ...releaseArgs,
                    ...commonArgs
                ],
                type: 'process',
                problemMatcher: '$msCompile'
            },
            {
                label: dotnetPublishTaskLabel,
                command: 'dotnet',
                args: [
                    'publish',
                    ...releaseArgs,
                    ...commonArgs
                ],
                type: 'process',
                dependsOn: 'clean release',
                problemMatcher: '$msCompile'
            },
            {
                type: func,
                dependsOn: 'build',
                options: {
                    cwd: this._debugSubpath
                },
                command: hostStartCommand,
                isBackground: true,
                problemMatcher: funcWatchProblemMatcher
            }
        ];
    }
}

export async function tryGetCsprojFile(projectPath: string): Promise<string | undefined> {
    return await tryGetProjFile(projectPath, /\.csproj$/i);
}

export async function tryGetFsprojFile(projectPath: string): Promise<string | undefined> {
    return await tryGetProjFile(projectPath, /\.fsproj$/i);
}

async function getFuncVersion(projFilePath: string): Promise<string> {
    return await getPropertyInProjFile(projFilePath, 'AzureFunctionsVersion');
}

export async function getTargetFramework(projFilePath: string): Promise<string> {
    return await getPropertyInProjFile(projFilePath, 'TargetFramework');
}

export async function getPropertyInProjFile(projFilePath: string, prop: string): Promise<string> {
    const projContents: string = (await fse.readFile(projFilePath)).toString();
    const regExp: RegExp = new RegExp(`<${prop}>(.*)<\\/${prop}>`);
    const matches: RegExpMatchArray | null = projContents.match(regExp);
    if (!matches) {
        throw new Error(localize('failedToFindProp', 'Failed to find "{0}" in project file "{1}".', prop, projFilePath));
    } else {
        return matches[1];
    }
}

/**
 * If a single proj file is found at the root of this folder, returns the path to that file. Otherwise returns undefined
 * NOTE: 'extensions.csproj' is excluded as it has special meaning for the func cli
 */
async function tryGetProjFile(projectPath: string, regexp: RegExp): Promise<string | undefined> {
    const files: string[] = await fse.readdir(projectPath);
    const projectFiles: string[] = files.filter((f: string) => regexp.test(f) && !/extensions\.csproj$/i.test(f));
    return projectFiles.length === 1 ? projectFiles[0] : undefined;
}
