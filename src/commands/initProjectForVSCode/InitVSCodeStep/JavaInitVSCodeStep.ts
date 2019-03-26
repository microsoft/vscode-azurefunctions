/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { DebugConfiguration, TaskDefinition, window } from 'vscode';
import { func, funcWatchProblemMatcher, hostStartCommand, javaPackageTaskLabel } from '../../../constants';
import { javaDebugConfig } from '../../../debug/JavaDebugProvider';
import { localize } from "../../../localize";
import { mavenUtils } from '../../../utils/mavenUtils';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { InitVSCodeStepBase } from './InitVSCodeStepBase';

export class JavaInitVSCodeStep extends InitVSCodeStepBase {
    protected preDeployTask: string = javaPackageTaskLabel;

    private _debugSubpath: string;

    protected async executeCore(wizardContext: IProjectWizardContext): Promise<void> {
        const pomFilePath: string = path.join(wizardContext.projectPath, 'pom.xml');
        if (!await fse.pathExists(pomFilePath)) {
            throw new Error(localize('pomNotFound', 'Cannot find pom.xml file in current project, please make sure the language setting is correct.'));
        }
        const functionAppName: string | undefined = await mavenUtils.getFunctionAppNameInPom(pomFilePath);
        if (!functionAppName) {
            this._debugSubpath = '<function_build_path>';
            window.showWarningMessage(localize('functionAppNameNotFound', 'Cannot parse the Azure Functions name from pom file, you may need to specify it in the tasks.json.'));
        } else {
            this._debugSubpath = `target/azure-functions/${functionAppName}/`;
        }

        this.setDeploySubpath(wizardContext, this._debugSubpath);
    }

    protected getTasks(): TaskDefinition[] {
        return [
            {
                type: func,
                command: hostStartCommand,
                problemMatcher: funcWatchProblemMatcher,
                isBackground: true,
                options: {
                    cwd: this._debugSubpath
                },
                dependsOn: javaPackageTaskLabel
            },
            {
                label: javaPackageTaskLabel,
                command: 'mvn clean package',
                type: 'shell'
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
