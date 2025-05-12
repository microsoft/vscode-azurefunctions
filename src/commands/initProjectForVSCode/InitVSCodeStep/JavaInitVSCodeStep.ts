/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { window, type DebugConfiguration, type TaskDefinition } from 'vscode';
import { JavaBuildTool, buildGradleFileName, func, hostStartCommand, hostStartTaskName, javaBuildTool, pomXmlFileName, type ProjectLanguage } from '../../../constants';
import { javaDebugConfig } from '../../../debug/JavaDebugProvider';
import { localize } from "../../../localize";
import { mavenUtils } from '../../../utils/mavenUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { getFuncWatchProblemMatcher } from '../../../vsCodeConfig/settings';
import { convertToFunctionsTaskLabel } from '../../../vsCodeConfig/tasks';
import { type IJavaProjectWizardContext } from '../../createNewProject/javaSteps/IJavaProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

const javaPackageTaskLabel: string = convertToFunctionsTaskLabel('package');

export class JavaInitVSCodeStep extends InitVSCodeStepBase {
    stepName: string = 'JavaInitVSCodeStep';
    protected preDeployTask: string = javaPackageTaskLabel;

    private _debugSubpath: string;
    private _buildTool: JavaBuildTool;

    protected async executeCore(context: IJavaProjectWizardContext): Promise<void> {
        this._buildTool = nonNullProp(context, 'buildTool');
        this.settings.push({ key: javaBuildTool, value: this._buildTool });
        const functionAppName: string | undefined = await getFunctionAppName(context.projectPath, this._buildTool);
        if (!functionAppName) {
            this._debugSubpath = '<function_build_path>';
            void window.showWarningMessage(localize('functionAppNameNotFound', 'Cannot parse the Azure Functions name, you may need to specify it in the tasks.json.'));
        } else {
            this._debugSubpath = getJavaDebugSubpath(functionAppName, this._buildTool);
        }

        this.setDeploySubpath(context, this._debugSubpath);
    }

    protected getTasks(language: ProjectLanguage): TaskDefinition[] {
        return [
            {
                type: func,
                label: hostStartTaskName,
                command: hostStartCommand,
                problemMatcher: getFuncWatchProblemMatcher(language),
                isBackground: true,
                options: {
                    cwd: this._debugSubpath
                },
                dependsOn: javaPackageTaskLabel
            },
            {
                label: javaPackageTaskLabel,
                command: getPackageCommand(this._buildTool),
                type: 'shell',
                group: {
                    kind: 'build',
                    isDefault: true
                }
            }
        ];
    }

    protected getDebugConfiguration(): DebugConfiguration {
        return javaDebugConfig;
    }

    protected getRecommendedExtensions(): string[] {
        return ['vscjava.vscode-java-debug'];
    }
}

export async function getFunctionAppName(projectPath: string, buildTool: JavaBuildTool | undefined): Promise<string | undefined> {
    switch (buildTool) {
        case JavaBuildTool.maven:
            const pomXmlPath: string = path.join(projectPath, pomXmlFileName);
            return mavenUtils.getFunctionAppNameInPom(pomXmlPath);
        case JavaBuildTool.gradle:
            const buildGradlePath: string = path.join(projectPath, buildGradleFileName);
            const buildGradle: string = (await AzExtFsExtra.readFile(buildGradlePath)).toString();
            const match: RegExpExecArray | null = /appName\s*?=\s*?['|"](.+?)['|"]/g.exec(buildGradle);
            return match ? match[1] : undefined;
        default:
            throw new Error(localize('invalidJavaBuildTool', 'Invalid java build tool {0}.', buildTool));
    }
}

export function getJavaDebugSubpath(functionAppName: string, buildTool: JavaBuildTool | undefined): string {
    switch (buildTool) {
        case JavaBuildTool.maven:
            return path.posix.join('target', 'azure-functions', functionAppName);
        case JavaBuildTool.gradle:
            return path.posix.join('build', 'azure-functions', functionAppName);
        default:
            throw new Error(localize('invalidJavaBuildTool', 'Invalid java build tool {0}.', buildTool));
    }
}

function getPackageCommand(buildTool: JavaBuildTool): string {
    switch (buildTool) {
        case JavaBuildTool.maven:
            return "mvn clean package";
        case JavaBuildTool.gradle:
            return "gradle azureFunctionsPackage";
        default:
            throw new Error(localize('invalidJavaBuildTool', 'Invalid java build tool {0}.', buildTool));
    }
}
