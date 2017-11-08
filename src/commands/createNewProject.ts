/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import * as FunctionsCli from '../functions-cli';
import { IUserInterface } from '../IUserInterface';
import { Pick } from '../IUserInterface';
import { localize } from '../localize';
import * as TemplateFiles from '../template-files';
import { TemplateLanguage } from '../templates/Template';
import * as fsUtil from '../utils/fs';
import * as workspaceUtil from '../utils/workspace';
import { VSCodeUI } from '../VSCodeUI';

export async function createNewProject(outputChannel: vscode.OutputChannel, functionAppPath?: string, ui: IUserInterface = new VSCodeUI()): Promise<void> {
    if (!functionAppPath) {
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectFunctionAppFolderNew', 'Select the folder that will contain your function app'));
    }

    const languages: Pick[] = [
        new Pick(TemplateLanguage.JavaScript),
        new Pick(TemplateLanguage.Java)
    ];
    const language: Pick = await ui.showQuickPick(languages, localize('azFunc.selectFuncTemplate', 'Select a language for your function project'));

    let javaTargetPath: string = '';
    switch (language.label) {
        case TemplateLanguage.Java:
            // Get parameters for Maven command
            const { groupId, artifactId, version, packageName, appName } = await promotForMavenParameters(ui, functionAppPath);
            // Use maven command to init Java function project.
            await FunctionsCli.createNewProject(
                outputChannel,
                functionAppPath,
                language.label,
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

            functionAppPath = path.join(functionAppPath, artifactId);
            javaTargetPath = `target/azure-functions/${appName}/`;
            break;
        default:
            await FunctionsCli.createNewProject(outputChannel, functionAppPath, language.label, 'init');
            break;
    }

    const tasksJsonPath: string = path.join(functionAppPath, '.vscode', 'tasks.json');
    const tasksJsonExists: boolean = await fse.pathExists(tasksJsonPath);
    const launchJsonPath: string = path.join(functionAppPath, '.vscode', 'launch.json');
    const launchJsonExists: boolean = await fse.pathExists(launchJsonPath);

    if (!tasksJsonExists || !launchJsonExists) {
        await fse.ensureDir(path.join(functionAppPath, '.vscode'));
        await Promise.all([
            fsUtil.writeFormattedJson(tasksJsonPath, TemplateFiles.getTasksJson(language.label, javaTargetPath)),
            fsUtil.writeFormattedJson(launchJsonPath, TemplateFiles.getLaunchJson(language.label))
        ]);
    }

    if (!workspaceUtil.isFolderOpenInWorkspace(functionAppPath)) {
        // If the selected folder is not open in a workspace, open it now. NOTE: This may restart the extension host
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(functionAppPath), false);
    }
}

async function promotForMavenParameters(ui: IUserInterface, functionAppPath: string): Promise<IMavenParameters> {
    const groupIdPlaceHolder: string = localize('azFunc.java.groupIdPlaceholder', 'Group ID');
    const groupIdPrompt: string = localize('azFunc.java.groupIdPrompt', 'Provide value for groupId');
    const groupId: string = await ui.showInputBox(groupIdPlaceHolder, groupIdPrompt, false, undefined, 'com.function');

    const artifactIdPlaceHolder: string = localize('azFunc.java.artifactIdPlaceholder', 'Artifact ID');
    const artifactIdprompt: string = localize('azFunc.java.artifactIdPrompt', 'Provide value for artifactId');
    const artifactId: string = await ui.showInputBox(artifactIdPlaceHolder, artifactIdprompt, false, undefined, path.basename(functionAppPath));

    const versionPlaceHolder: string = localize('azFunc.java.versionPlaceHolder', 'Version');
    const versionPrompt: string = localize('azFunc.java.versionPrompt', 'Provide value for version');
    const version: string = await ui.showInputBox(versionPlaceHolder, versionPrompt, false, undefined, '1.0-SNAPSHOT');

    const packagePlaceHolder: string = localize('azFunc.java.packagePlaceHolder', 'Package');
    const packagePrompt: string = localize('azFunc.java.packagePrompt', 'Provide value for package');
    const packageName: string = await ui.showInputBox(packagePlaceHolder, packagePrompt, false, undefined, groupId);

    const appNamePlaceHolder: string = localize('azFunc.java.appNamePlaceHolder', 'App Name');
    const appNamePrompt: string = localize('azFunc.java.appNamePrompt', 'Provide value for appName');
    const appName: string = await ui.showInputBox(appNamePlaceHolder, appNamePrompt, false, undefined, `${artifactId}-${Date.now()}`);

    return {
        groupId: groupId,
        artifactId: artifactId,
        version: version,
        packageName: packageName,
        appName: appName
    };
}

interface IMavenParameters {
    groupId: string;
    artifactId: string;
    version: string;
    packageName: string;
    appName: string;
}
