/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { DebugConfiguration, TaskDefinition, window } from 'vscode';
import { func, hostStartCommand, pomXmlFileName, ProjectLanguage } from '../../../constants';
import { javaDebugConfig } from '../../../debug/JavaDebugProvider';
import { localize } from "../../../localize";
import { mavenUtils } from '../../../utils/mavenUtils';
import { getFuncWatchProblemMatcher } from '../../../vsCodeConfig/settings';
import { convertToFunctionsTaskLabel } from '../../../vsCodeConfig/tasks';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

const javaPackageTaskLabel: string = convertToFunctionsTaskLabel('package');

export class JavaInitVSCodeStep extends InitVSCodeStepBase {
    protected preDeployTask: string = javaPackageTaskLabel;

    private _debugSubpath: string;

    protected async executeCore(context: IProjectWizardContext): Promise<void> {
        const pomFilePath: string = path.join(context.projectPath, pomXmlFileName);
        if (!await fse.pathExists(pomFilePath)) {
            throw new Error(localize('pomNotFound', 'Cannot find pom.xml file in current project, please make sure the language setting is correct.'));
        }
        const functionAppName: string | undefined = await mavenUtils.getFunctionAppNameInPom(pomFilePath);
        if (!functionAppName) {
            this._debugSubpath = '<function_build_path>';
            void window.showWarningMessage(localize('functionAppNameNotFound', 'Cannot parse the Azure Functions name from pom file, you may need to specify it in the tasks.json.'));
        } else {
            this._debugSubpath = getJavaDebugSubpath(functionAppName);
        }

        this.setDeploySubpath(context, this._debugSubpath);
    }

    protected getTasks(language: ProjectLanguage): TaskDefinition[] {
        return [
            {
                type: func,
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
                command: 'mvn clean package',
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

export function getJavaDebugSubpath(functionAppName: string): string {
    return path.posix.join('target', 'azure-functions', functionAppName);
}
