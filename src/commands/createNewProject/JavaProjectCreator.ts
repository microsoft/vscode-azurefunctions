/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { InputBoxOptions } from 'vscode';
import { IActionContext, IAzureUserInput } from "vscode-azureextensionui";
import { ProjectRuntime, TemplateFilter } from '../../constants';
import { funcHostTaskLabel } from "../../funcCoreTools/funcHostTask";
import { localize } from "../../localize";
import * as fsUtil from '../../utils/fs';
import { validateMavenIdentifier, validatePackageName } from '../../utils/javaNameUtils';
import { mavenUtils } from '../../utils/mavenUtils';
import { funcWatchProblemMatcher, ProjectCreatorBase } from './IProjectCreator';

export class JavaProjectCreator extends ProjectCreatorBase {
    public static defaultRuntime: ProjectRuntime = ProjectRuntime.v2;
    public readonly templateFilter: TemplateFilter = TemplateFilter.Verified;

    private _javaTargetPath: string;
    private _actionContext: IActionContext;

    constructor(functionAppPath: string, outputChannel: vscode.OutputChannel, ui: IAzureUserInput, actionContext: IActionContext) {
        super(functionAppPath, outputChannel, ui, actionContext.properties);
        this._actionContext = actionContext;
    }

    public async getRuntime(): Promise<ProjectRuntime> {
        return JavaProjectCreator.defaultRuntime;
    }

    public async addNonVSCodeFiles(): Promise<void> {
        await mavenUtils.validateMavenInstalled(this._actionContext, this.functionAppPath);

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
            await mavenUtils.executeMvnCommand(
                this.telemetryProperties,
                this.outputChannel,
                tempFolder,
                'archetype:generate',
                mavenUtils.formatMavenArg('DarchetypeGroupId', 'com.microsoft.azure'),
                mavenUtils.formatMavenArg('DarchetypeArtifactId', 'azure-functions-archetype'),
                mavenUtils.formatMavenArg('DgroupId', groupId),
                mavenUtils.formatMavenArg('DartifactId', artifactId),
                mavenUtils.formatMavenArg('Dversion', version),
                mavenUtils.formatMavenArg('Dpackage', packageName),
                mavenUtils.formatMavenArg('DappName', appName),
                '-B' // in Batch Mode
            );
            await fsUtil.copyFolder(path.join(tempFolder, artifactId), this.functionAppPath, this.ui);
        } finally {
            await fse.remove(tempFolder);
        }
        this._javaTargetPath = `target/azure-functions/${appName}/`;
    }

    public async getTasksJson(): Promise<{}> {
        let tasksJson: {} = {
            version: '2.0.0',
            tasks: [
                {
                    label: funcHostTaskLabel,
                    linux: {
                        command: 'sh -c "mvn clean package -B && func host start --language-worker -- \\\"-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005\\\" --script-root \\\"%path%\\\""'
                    },
                    osx: {
                        command: 'sh -c "mvn clean package -B && func host start --language-worker -- \\\"-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005\\\" --script-root \\\"%path%\\\""'
                    },
                    windows: {
                        command: 'powershell -command "mvn clean package -B; func host start --language-worker -- \\\"-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005\\\" --script-root \\\"%path%\\\""'
                    },
                    type: 'shell',
                    isBackground: true,
                    presentation: {
                        reveal: 'always'
                    },
                    problemMatcher: funcWatchProblemMatcher
                }
            ]
        };
        let tasksJsonString: string = JSON.stringify(tasksJson);
        if (!this._javaTargetPath) {
            const pomFilePath: string = path.join(this.functionAppPath, 'pom.xml');
            if (!await fse.pathExists(pomFilePath)) {
                throw new Error(localize('pomNotFound', 'Cannot find pom file in current project, please make sure the language setting is correct.'));
            }
            const functionAppName: string | undefined = await mavenUtils.getFunctionAppNameInPom(pomFilePath);
            if (!functionAppName) {
                this._javaTargetPath = '<function_build_path>';
                vscode.window.showWarningMessage(localize('functionAppNameNotFound', 'Cannot parse the Azure Functions name from pom file, you may need to specify it in the tasks.json.'));
            } else {
                this._javaTargetPath = `target/azure-functions/${functionAppName}/`;
            }
        }
        tasksJsonString = tasksJsonString.replace(/%path%/g, this._javaTargetPath);
        // tslint:disable-next-line:no-string-literal no-unsafe-any
        tasksJson = JSON.parse(tasksJsonString);
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
                    preLaunchTask: funcHostTaskLabel
                }
            ]
        };
    }

    public getRecommendedExtensions(): string[] {
        return super.getRecommendedExtensions().concat(['vscjava.vscode-java-debug']);
    }
}
