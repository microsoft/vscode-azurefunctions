/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { OutputChannel } from 'vscode';
import * as vscode from 'vscode';
import { TelemetryProperties } from 'vscode-azureextensionui';
import { IUserInterface, Pick } from '../../IUserInterface';
import { localize } from '../../localize';
import { getGlobalFuncExtensionSetting, ProjectLanguage, projectLanguageSetting } from '../../ProjectSettings';
import { gitUtils } from '../../utils/gitUtils';
import * as workspaceUtil from '../../utils/workspace';
import { VSCodeUI } from '../../VSCodeUI';
import { CSharpProjectCreator } from './CSharpProjectCreator';
import { CSharpScriptProjectCreator } from './CSharpScriptProjectCreator';
import { initProjectForVSCode } from './initProjectForVSCode';
import { ProjectCreatorBase } from './IProjectCreator';
import { JavaProjectCreator } from './JavaProjectCreator';
import { JavaScriptProjectCreator } from './JavaScriptProjectCreator';
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export async function createNewProject(telemetryProperties: TelemetryProperties, outputChannel: OutputChannel, functionAppPath?: string, language?: string, openFolder: boolean = true, ui: IUserInterface = new VSCodeUI()): Promise<void> {
    if (functionAppPath === undefined) {
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectFunctionAppFolderNew', 'Select the folder that will contain your function app'));
    }
    await fse.ensureDir(functionAppPath);

    if (!language) {
        language = getGlobalFuncExtensionSetting(projectLanguageSetting);

        if (!language) {
            // Only display 'supported' languages that can be debugged in VS Code
            const languagePicks: Pick[] = [
                new Pick(ProjectLanguage.JavaScript),
                new Pick(ProjectLanguage.CSharp),
                new Pick(ProjectLanguage.Java)
            ];
            language = (await ui.showQuickPick(languagePicks, localize('azFunc.selectFuncTemplate', 'Select a language for your function project'))).label;
        }
    }
    telemetryProperties.projectLanguage = language;

    const projectCreator: ProjectCreatorBase = getProjectCreator(language, functionAppPath, outputChannel, ui, telemetryProperties);
    await projectCreator.addNonVSCodeFiles();

    await initProjectForVSCode(telemetryProperties, outputChannel, functionAppPath, language, ui, projectCreator);

    if (await gitUtils.isGitInstalled(functionAppPath)) {
        await gitUtils.gitInit(outputChannel, functionAppPath);
    }

    if (openFolder && !workspaceUtil.isFolderOpenInWorkspace(functionAppPath)) {
        // If the selected folder is not open in a workspace, open it now. NOTE: This may restart the extension host
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(functionAppPath), false);
    }
}

export function getProjectCreator(language: string, functionAppPath: string, outputChannel: OutputChannel, ui: IUserInterface, telemetryProperties: TelemetryProperties): ProjectCreatorBase {
    switch (language) {
        case ProjectLanguage.Java:
            return new JavaProjectCreator(functionAppPath, outputChannel, ui, telemetryProperties);
        case ProjectLanguage.JavaScript:
            return new JavaScriptProjectCreator(functionAppPath, outputChannel, ui, telemetryProperties);
        case ProjectLanguage.CSharp:
            return new CSharpProjectCreator(functionAppPath, outputChannel, ui, telemetryProperties);
        case ProjectLanguage.CSharpScript:
            return new CSharpScriptProjectCreator(functionAppPath, outputChannel, ui, telemetryProperties);
        default:
            return new ScriptProjectCreatorBase(functionAppPath, outputChannel, ui, telemetryProperties);
    }
}
