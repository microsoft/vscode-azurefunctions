/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { DebugConfiguration, MessageItem, TaskDefinition } from 'vscode';
import { DialogResponses, parseError } from 'vscode-azureextensionui';
import { dotnetPublishTaskLabel, ProjectLanguage } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { FuncVersion, tryParseFuncVersion } from '../../../FuncVersion';
import { localize } from "../../../localize";
import { dotnetUtils } from '../../../utils/dotnetUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { openUrl } from '../../../utils/openUrl';
import { getWorkspaceSetting, updateGlobalSetting } from '../../../vsCodeConfig/settings';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

const buildTaskName: string = 'build';

export class DotnetInitVSCodeStep extends InitVSCodeStepBase {
    protected preDeployTask: string = dotnetPublishTaskLabel;

    private _debugSubpath: string;

    protected getDebugConfiguration(version: FuncVersion): DebugConfiguration {
        return {
            name: localize('launchNetFunctions', "Launch .NET Functions"),
            type: version === FuncVersion.v1 ? 'clr' : 'coreclr',
            request: 'launch',
            preLaunchTask: buildTaskName,
            program: 'func',
            args: ['start'],
            cwd: path.posix.join('\${workspaceFolder}', this._debugSubpath),
            console: 'integratedTerminal',
            internalConsoleOptions: 'neverOpen'
        };
    }

    protected getRecommendedExtensions(language: ProjectLanguage): string[] {
        // The csharp extension is really a 'dotnet' extension because it provides debugging for both
        const recs: string[] = ['ms-dotnettools.csharp'];
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

        let projFileName: string;
        const projFiles: string[] = await dotnetUtils.getProjFiles(language, projectPath);
        const fileExt: string = language === ProjectLanguage.FSharp ? 'fsproj' : 'csproj';
        if (projFiles.length === 1) {
            projFileName = projFiles[0];
        } else if (projFiles.length === 0) {
            context.errorHandling.suppressReportIssue = true;
            throw new Error(localize('projNotFound', 'Failed to find {0} file in folder "{1}".', fileExt, path.basename(projectPath)));
        } else {
            context.errorHandling.suppressReportIssue = true;
            throw new Error(localize('projNotFound', 'Expected to find a single {0} file in folder "{1}", but found multiple instead: {2}.', fileExt, path.basename(projectPath), projFiles.join(', ')));
        }

        const projFilePath: string = path.join(projectPath, projFileName);

        const versionInProjFile: string = await dotnetUtils.getPropertyInProjFile(projFilePath, 'AzureFunctionsVersion');
        context.telemetry.properties.versionInProjFile = versionInProjFile;
        // The version from the proj file takes precedence over whatever was set in `context` before this
        // tslint:disable-next-line: strict-boolean-expressions
        context.version = tryParseFuncVersion(versionInProjFile) || context.version;

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

        const targetFramework: string = await dotnetUtils.getTargetFramework(projFilePath);
        this.setDeploySubpath(context, `bin/Release/${targetFramework}/publish`);
        this._debugSubpath = dotnetUtils.getDotnetDebugSubpath(targetFramework);
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
                label: buildTaskName,
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
            }
        ];
    }
}
