/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { InputBoxOptions } from 'vscode';
import { localize } from "../../localize";
import { ProjectRuntime, TemplateFilter } from '../../ProjectSettings';
import { cpUtils } from '../../utils/cpUtils';
import * as fsUtil from '../../utils/fs';
import { validateMavenIdentifier, validatePackageName } from '../../utils/javaNameUtils';
import { mavenUtils } from '../../utils/mavenUtils';
import { funcHostProblemMatcher, funcHostTaskId, funcHostTaskLabel, ProjectCreatorBase } from './IProjectCreator';

export class JavaProjectCreator extends ProjectCreatorBase {
    public static defaultRuntime: ProjectRuntime = ProjectRuntime.beta;
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;

    private _javaTargetPath: string;

    public async getRuntime(): Promise<ProjectRuntime> {
        return JavaProjectCreator.defaultRuntime;
    }

    public async addNonVSCodeFiles(): Promise<void> {
        await mavenUtils.validateMavenInstalled(this.functionAppPath);

        const groupOptions: InputBoxOptions = {
            placeHolder: localize('azFunc.java.groupIdPlaceholder', 'Group ID'),
            prompt: localize('azFunc.java.groupIdPrompt', 'Provide value for groupId'),
            validateInput: validateMavenIdentifier,
            value: 'com.function'
        };
        const groupId: string = await this.ui.showInputBox(groupOptions);

        const artifactOptions: InputBoxOptions = {
            placeHolder: localize('azFunc.java.artifactIdPlaceholder', 'Artifact ID'),
            prompt: localize('azFunc.java.artifactIdPrompt', 'Provide value for artifactId'),
            validateInput: validateMavenIdentifier,
            value: path.basename(this.functionAppPath)
        };
        const artifactId: string = await this.ui.showInputBox(artifactOptions);

        const versionOptions: InputBoxOptions = {
            placeHolder: localize('azFunc.java.versionPlaceHolder', 'Version'),
            prompt: localize('azFunc.java.versionPrompt', 'Provide value for version'),
            value: '1.0-SNAPSHOT'
        };
        const version: string = await this.ui.showInputBox(versionOptions);

        const packageOptions: InputBoxOptions = {
            placeHolder: localize('azFunc.java.packagePlaceHolder', 'Package'),
            prompt: localize('azFunc.java.packagePrompt', 'Provide value for package'),
            validateInput: validatePackageName,
            value: groupId
        };
        const packageName: string = await this.ui.showInputBox(packageOptions);

        const appNameOptions: InputBoxOptions = {
            placeHolder: localize('azFunc.java.appNamePlaceHolder', 'App Name'),
            prompt: localize('azFunc.java.appNamePrompt', 'Provide value for appName'),
            value: `${artifactId}-${Date.now()}`
        };
        const appName: string = await this.ui.showInputBox(appNameOptions);

        const tempFolder: string = path.join(os.tmpdir(), fsUtil.getRandomHexString());
        await fse.ensureDir(tempFolder);
        try {
            // Use maven command to init Java function project.
            this.outputChannel.show();
            await cpUtils.executeCommand(
                this.outputChannel,
                tempFolder,
                'mvn',
                'archetype:generate',
                '-DarchetypeGroupId="com.microsoft.azure"',
                '-DarchetypeArtifactId="azure-functions-archetype"',
                `-DgroupId="${groupId}"`,
                `-DartifactId="${artifactId}"`,
                `-Dversion="${version}"`,
                `-Dpackage="${packageName}"`,
                `-DappName="${appName}"`,
                '-B' // in Batch Mode
            );
            await fsUtil.copyFolder(path.join(tempFolder, artifactId), this.functionAppPath, this.ui);
        } finally {
            await fse.remove(tempFolder);
        }
        this._javaTargetPath = `target/azure-functions/${appName}/`;
    }

    public getTasksJson(): {} {
        let tasksJson: {} = {
            version: '2.0.0',
            tasks: [
                {
                    label: funcHostTaskLabel,
                    identifier: funcHostTaskId,
                    linux: {
                        command: 'sh -c "mvn clean package -B && func host start --script-root \\\"%path%\\\""'
                    },
                    osx: {
                        command: 'sh -c "mvn clean package -B && func host start --script-root \\\"%path%\\\""'
                    },
                    windows: {
                        command: 'powershell -command "mvn clean package -B; func host start --script-root \\\"%path%\\\""'
                    },
                    type: 'shell',
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: [
                        funcHostProblemMatcher
                    ]
                }
            ]
        };
        let tasksJsonString: string = JSON.stringify(tasksJson);
        tasksJsonString = tasksJsonString.replace(/%path%/g, this._javaTargetPath);
        // tslint:disable-next-line:no-string-literal no-unsafe-any
        tasksJson = JSON.parse(tasksJsonString);
        // tslint:disable-next-line:no-string-literal no-unsafe-any
        tasksJson['tasks'][0]['problemMatcher'][0]['background']['beginsPattern'] = '^.*Scanning for projects.*';
        return tasksJson;
    }

    public getLaunchJson(): {} {
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToJavaFunc', 'Attach to Java Functions'),
                    type: 'java',
                    request: 'attach',
                    hostName: 'localhost',
                    port: 5005,
                    preLaunchTask: funcHostTaskId
                }
            ]
        };
    }

    public getRecommendedExtensions(): string[] {
        return super.getRecommendedExtensions().concat(['vscjava.vscode-java-debug']);
    }
}
