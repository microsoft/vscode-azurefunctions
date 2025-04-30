/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, parseError } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type DebugConfiguration, type MessageItem, type TaskDefinition } from 'vscode';
import { FuncVersion, tryParseFuncVersion } from '../../../FuncVersion';
import { ProjectLanguage, func, hostStartCommand } from '../../../constants';
import { localize } from "../../../localize";
import { dotnetUtils } from '../../../utils/dotnetUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { openUrl } from '../../../utils/openUrl';
import { getFuncWatchProblemMatcher, getWorkspaceSetting, updateGlobalSetting } from '../../../vsCodeConfig/settings';
import { convertToFunctionsTaskLabel } from '../../../vsCodeConfig/tasks';
import { type IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

const dotnetPublishTaskLabel: string = convertToFunctionsTaskLabel('publish');

export class DotnetInitVSCodeStep extends InitVSCodeStepBase {
    protected preDeployTask: string = dotnetPublishTaskLabel;
    stepName: string = 'DotnetInitVSCodeStep';
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

        let projFile: dotnetUtils.ProjectFile;
        const projFiles: dotnetUtils.ProjectFile[] = await dotnetUtils.getProjFiles(context, language, projectPath);
        const fileExt: string = language === ProjectLanguage.FSharp ? 'fsproj' : 'csproj';
        if (projFiles.length === 1) {
            projFile = projFiles[0];
        } else if (projFiles.length === 0) {
            context.errorHandling.suppressReportIssue = true;
            throw new Error(localize('projNotFound', 'Failed to find {0} file in folder "{1}".', fileExt, path.basename(projectPath)));
        } else {
            context.errorHandling.suppressReportIssue = true;
            throw new Error(localize('projNotFound', 'Expected to find a single {0} file in folder "{1}", but found multiple instead: {2}.', fileExt, path.basename(projectPath), projFiles.join(', ')));
        }

        const versionInProjFile: string | undefined = await dotnetUtils.tryGetFuncVersion(projFile);
        context.telemetry.properties.versionInProjFile = versionInProjFile;
        // The version from the proj file takes precedence over whatever was set in `context` before this
        context.version = tryParseFuncVersion(versionInProjFile) || context.version;

        if (context.version === FuncVersion.v1) {
            const settingKey: string = 'show64BitWarning';
            if (getWorkspaceSetting<boolean>(settingKey)) {
                const message: string = localize('64BitWarning', 'In order to debug .NET Framework functions in VS Code, you must install a 64-bit version of the Azure Functions Core Tools.');
                try {
                    const result: MessageItem = await context.ui.showWarningMessage(message, { stepName: 'netDebug64bit' }, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
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

        const targetFramework: string = await dotnetUtils.getTargetFramework(projFile);
        this.setDeploySubpath(context, `bin/Release/${targetFramework}/publish`);
        this._debugSubpath = dotnetUtils.getDotnetDebugSubpath(targetFramework);
    }

    protected getTasks(language: ProjectLanguage): TaskDefinition[] {
        const commonArgs: string[] = ['/property:GenerateFullPaths=true', '/consoleloggerparameters:NoSummary'];
        const releaseArgs: string[] = ['--configuration', 'Release'];

        const buildLabel = convertToFunctionsTaskLabel('build');
        const cleanLabel = convertToFunctionsTaskLabel('clean');
        const cleanReleaseLabel = convertToFunctionsTaskLabel('clean release');

        return [
            {
                label: cleanLabel,
                command: 'dotnet',
                args: [
                    'clean',
                    ...commonArgs
                ],
                type: 'process',
                problemMatcher: '$msCompile'
            },
            {
                label: buildLabel,
                command: 'dotnet',
                args: [
                    'build',
                    ...commonArgs
                ],
                type: 'process',
                dependsOn: cleanLabel,
                group: {
                    kind: 'build',
                    isDefault: true
                },
                problemMatcher: '$msCompile'
            },
            {
                label: cleanReleaseLabel,
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
                dependsOn: cleanReleaseLabel,
                problemMatcher: '$msCompile'
            },
            {
                type: func,
                dependsOn: buildLabel,
                options: {
                    cwd: this._debugSubpath
                },
                command: hostStartCommand,
                isBackground: true,
                problemMatcher: getFuncWatchProblemMatcher(language)
            }
        ];
    }
}
