/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { OutputChannel } from 'vscode';
import { IUserInterface } from '../../IUserInterface';
import { localize } from "../../localize";
import { ProjectRuntime } from '../../ProjectSettings';
import { cpUtils } from '../../utils/cpUtils';
import * as fsUtil from '../../utils/fs';
import { validateMavenIdentifier, validatePackageName } from '../../utils/javaNameUtils';
import { mavenUtils } from '../../utils/mavenUtils';
import { IProjectCreator } from './IProjectCreator';

export class JavaProjectCreator implements IProjectCreator {
    private _javaTargetPath: string;
    private _outputChannel: OutputChannel;
    private _ui: IUserInterface;
    constructor(outputChannel: OutputChannel, ui: IUserInterface) {
        this._outputChannel = outputChannel;
        this._ui = ui;
    }

    public async addNonVSCodeFiles(functionAppPath: string): Promise<void> {
        await mavenUtils.validateMavenInstalled(functionAppPath);

        const groupIdPlaceHolder: string = localize('azFunc.java.groupIdPlaceholder', 'Group ID');
        const groupIdPrompt: string = localize('azFunc.java.groupIdPrompt', 'Provide value for groupId');
        const groupId: string = await this._ui.showInputBox(groupIdPlaceHolder, groupIdPrompt, false, validateMavenIdentifier, 'com.function');

        const artifactIdPlaceHolder: string = localize('azFunc.java.artifactIdPlaceholder', 'Artifact ID');
        const artifactIdprompt: string = localize('azFunc.java.artifactIdPrompt', 'Provide value for artifactId');
        const artifactId: string = await this._ui.showInputBox(artifactIdPlaceHolder, artifactIdprompt, false, validateMavenIdentifier, path.basename(functionAppPath));

        const versionPlaceHolder: string = localize('azFunc.java.versionPlaceHolder', 'Version');
        const versionPrompt: string = localize('azFunc.java.versionPrompt', 'Provide value for version');
        const version: string = await this._ui.showInputBox(versionPlaceHolder, versionPrompt, false, undefined, '1.0-SNAPSHOT');

        const packagePlaceHolder: string = localize('azFunc.java.packagePlaceHolder', 'Package');
        const packagePrompt: string = localize('azFunc.java.packagePrompt', 'Provide value for package');
        const packageName: string = await this._ui.showInputBox(packagePlaceHolder, packagePrompt, false, validatePackageName, groupId);

        const appNamePlaceHolder: string = localize('azFunc.java.appNamePlaceHolder', 'App Name');
        const appNamePrompt: string = localize('azFunc.java.appNamePrompt', 'Provide value for appName');
        const appName: string = await this._ui.showInputBox(appNamePlaceHolder, appNamePrompt, false, undefined, `${artifactId}-${Date.now()}`);

        const tempFolder: string = path.join(os.tmpdir(), fsUtil.getRandomHexString());
        await fse.ensureDir(tempFolder);
        try {
            // Use maven command to init Java function project.
            this._outputChannel.show();
            await cpUtils.executeCommand(
                this._outputChannel,
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
            await fsUtil.copyFolder(path.join(tempFolder, artifactId), functionAppPath);
        } finally {
            await fse.remove(tempFolder);
        }
        this._javaTargetPath = `target/azure-functions/${appName}/`;
    }

    public getRuntime(): ProjectRuntime {
        return ProjectRuntime.beta;
    }

    public getTasksJson(launchTaskId: string, funcProblemMatcher: {}): {} {
        let tasksJson: {} = {
            version: '2.0.0',
            tasks: [
                {
                    label: localize('azFunc.launchFuncApp', 'Launch Function App'),
                    identifier: launchTaskId,
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
                        funcProblemMatcher
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

    public getLaunchJson(launchTaskId: string): {} {
        return {
            version: '0.2.0',
            configurations: [
                {
                    name: localize('azFunc.attachToJavaFunc', 'Attach to Java Functions'),
                    type: 'java',
                    request: 'attach',
                    hostName: 'localhost',
                    port: 5005,
                    preLaunchTask: launchTaskId
                }
            ]
        };
    }
}
