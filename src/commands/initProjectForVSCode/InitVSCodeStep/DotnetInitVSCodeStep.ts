/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { DebugConfiguration, MessageItem, TaskDefinition } from 'vscode';
import { DialogResponses, parseError } from 'vscode-azureextensionui';
import { dotnetPublishTaskLabel, func, funcWatchProblemMatcher, hostStartCommand, ProjectLanguage, ProjectRuntime } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { localize } from "../../../localize";
import { getFuncExtensionSetting, updateGlobalSetting } from '../../../ProjectSettings';
import { nonNullProp } from '../../../utils/nonNull';
import { openUrl } from '../../../utils/openUrl';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

export class DotnetInitVSCodeStep extends InitVSCodeStepBase {
    protected preDeployTask: string = dotnetPublishTaskLabel;

    private _debugSubpath: string;

    protected getDebugConfiguration(runtime: ProjectRuntime): DebugConfiguration {
        return {
            name: localize('attachToNetFunc', "Attach to .NET Functions"),
            type: runtime === ProjectRuntime.v1 ? 'clr' : 'coreclr',
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
     * Detects the runtime based on the targetFramework from the proj file
     * Also performs a few validations and sets a few properties based on that targetFramework
     */
    protected async executeCore(wizardContext: IProjectWizardContext): Promise<void> {
        const projectPath: string = wizardContext.projectPath;
        const language: ProjectLanguage = nonNullProp(wizardContext, 'language');

        const projName: string | undefined = language === ProjectLanguage.FSharp ? await tryGetFsprojFile(projectPath) : await tryGetCsprojFile(projectPath);
        if (!projName) {
            throw new Error(localize('projNotFound', 'Expected to find a single project file in folder "{1}", but found zero or multiple instead.', path.basename(projectPath)));
        }

        const projPath: string = path.join(projectPath, projName);
        const projContents: string = (await fse.readFile(projPath)).toString();
        const matches: RegExpMatchArray | null = projContents.match(/<TargetFramework>(.*)<\/TargetFramework>/);
        if (matches === null || matches.length < 1) {
            throw new Error(localize('unrecognizedTargetFramework', 'Unrecognized target framework in project file "{0}".', projName));
        } else {
            const targetFramework: string = matches[1];
            wizardContext.actionContext.properties.dotnetTargetFramework = targetFramework;
            if (/net(standard|core)/i.test(targetFramework)) {
                wizardContext.runtime = ProjectRuntime.v2;
            } else {
                wizardContext.runtime = ProjectRuntime.v1;
                const settingKey: string = 'show64BitWarning';
                if (getFuncExtensionSetting<boolean>(settingKey)) {
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
            this.setDeploySubpath(wizardContext, `bin/Release/${targetFramework}/publish`);
            this._debugSubpath = `bin/Debug/${targetFramework}`;
        }
    }

    protected getTasks(): TaskDefinition[] {
        return [
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

/**
 * If a single proj file is found at the root of this folder, returns the path to that file. Otherwise returns undefined
 * NOTE: 'extensions.csproj' is excluded as it has special meaning for the func cli
 */
async function tryGetProjFile(projectPath: string, regexp: RegExp): Promise<string | undefined> {
    const files: string[] = await fse.readdir(projectPath);
    const projectFiles: string[] = files.filter((f: string) => regexp.test(f) && !/extensions\.csproj$/i.test(f));
    return projectFiles.length === 1 ? projectFiles[0] : undefined;
}
