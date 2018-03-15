/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as vscode from 'vscode';
import { OutputChannel, QuickPickItem, QuickPickOptions } from 'vscode';
import { IAzureUserInput, TelemetryProperties } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { getGlobalFuncExtensionSetting, ProjectLanguage, projectLanguageSetting } from '../../ProjectSettings';
import { gitUtils } from '../../utils/gitUtils';
import * as workspaceUtil from '../../utils/workspace';
import { CSharpProjectCreator } from './CSharpProjectCreator';
import { CSharpScriptProjectCreator } from './CSharpScriptProjectCreator';
import { initProjectForVSCode } from './initProjectForVSCode';
import { ProjectCreatorBase } from './IProjectCreator';
import { JavaProjectCreator } from './JavaProjectCreator';
import { JavaScriptProjectCreator } from './JavaScriptProjectCreator';
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export async function createNewProject(telemetryProperties: TelemetryProperties, outputChannel: OutputChannel, ui: IAzureUserInput, functionAppPath?: string, language?: string, runtime?: string, openFolder: boolean = true): Promise<void> {
    if (functionAppPath === undefined) {
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ui, localize('azFunc.selectFunctionAppFolderNew', 'Select the folder that will contain your function app'));
    }
    await fse.ensureDir(functionAppPath);

    if (!language) {
        language = getGlobalFuncExtensionSetting(projectLanguageSetting);

        if (!language) {
            // Only display 'supported' languages that can be debugged in VS Code
            const languagePicks: QuickPickItem[] = [
                { label: ProjectLanguage.JavaScript, description: '' },
                { label: ProjectLanguage.CSharp, description: '' },
                { label: ProjectLanguage.Java, description: '' }
            ];
            const options: QuickPickOptions = { placeHolder: localize('azFunc.selectFuncTemplate', 'Select a language for your function project') };
            language = (await ui.showQuickPick(languagePicks, options)).label;
        }
    }
    telemetryProperties.projectLanguage = language;

    const projectCreator: ProjectCreatorBase = getProjectCreator(language, functionAppPath, outputChannel, ui, telemetryProperties);
    await projectCreator.addNonVSCodeFiles();

    await initProjectForVSCode(telemetryProperties, ui, outputChannel, functionAppPath, language, runtime, projectCreator);

    if (await gitUtils.isGitInstalled(functionAppPath)) {
        await gitUtils.gitInit(outputChannel, functionAppPath);
    }

    if (openFolder && !workspaceUtil.isFolderOpenInWorkspace(functionAppPath)) {
        // If the selected folder is not open in a workspace, open it now. NOTE: This may restart the extension host
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(functionAppPath), false);
    }
}

export function getProjectCreator(language: string, functionAppPath: string, outputChannel: OutputChannel, ui: IAzureUserInput, telemetryProperties: TelemetryProperties): ProjectCreatorBase {
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
