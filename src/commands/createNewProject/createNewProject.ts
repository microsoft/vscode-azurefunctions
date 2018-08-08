/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { QuickPickItem, QuickPickOptions } from 'vscode';
import { IActionContext, TelemetryProperties } from 'vscode-azureextensionui';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime } from '../../constants';
import { ext } from '../../extensionVariables';
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../../localize';
import { getGlobalFuncExtensionSetting } from '../../ProjectSettings';
import { gitUtils } from '../../utils/gitUtils';
import * as workspaceUtil from '../../utils/workspace';
import { createFunction } from '../createFunction/createFunction';
import { CSharpProjectCreator } from './CSharpProjectCreator';
import { CSharpScriptProjectCreator } from './CSharpScriptProjectCreator';
import { initProjectForVSCode } from './initProjectForVSCode';
import { ProjectCreatorBase } from './IProjectCreator';
import { JavaProjectCreator } from './JavaProjectCreator';
import { JavaScriptProjectCreator } from './JavaScriptProjectCreator';
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';

export async function createNewProject(
    actionContext: IActionContext,
    functionAppPath?: string,
    language?: string,
    runtime?: string,
    openFolder: boolean = true,
    templateId?: string,
    functionName?: string,
    caseSensitiveFunctionSettings?: { [key: string]: string | undefined; }): Promise<void> {

    if (functionAppPath === undefined) {
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ext.ui, localize('azFunc.selectFunctionAppFolderNew', 'Select the folder that will contain your function app'));
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
            language = (await ext.ui.showQuickPick(languagePicks, options)).label;
        }
    }
    actionContext.properties.projectLanguage = language;

    const projectCreator: ProjectCreatorBase = getProjectCreator(language, functionAppPath, actionContext.properties);
    await projectCreator.addNonVSCodeFiles();

    await initProjectForVSCode(actionContext.properties, ext.ui, ext.outputChannel, functionAppPath, language, runtime, projectCreator);

    if (await gitUtils.isGitInstalled(functionAppPath) && !await gitUtils.isInsideRepo(functionAppPath)) {
        await gitUtils.gitInit(ext.outputChannel, functionAppPath);
    }

    if (templateId) {
        await createFunction(actionContext, functionAppPath, templateId, functionName, caseSensitiveFunctionSettings, <ProjectLanguage>language, <ProjectRuntime>runtime);
    }
    await validateFuncCoreToolsInstalled();

    if (openFolder) {
        await workspaceUtil.ensureFolderIsOpen(functionAppPath, actionContext);
    }
}

export function getProjectCreator(language: string, functionAppPath: string, telemetryProperties: TelemetryProperties): ProjectCreatorBase {
    switch (language) {
        case ProjectLanguage.Java:
            return new JavaProjectCreator(functionAppPath, ext.outputChannel, ext.ui, telemetryProperties);
        case ProjectLanguage.JavaScript:
            return new JavaScriptProjectCreator(functionAppPath, ext.outputChannel, ext.ui, telemetryProperties);
        case ProjectLanguage.CSharp:
            return new CSharpProjectCreator(functionAppPath, ext.outputChannel, ext.ui, telemetryProperties);
        case ProjectLanguage.CSharpScript:
            return new CSharpScriptProjectCreator(functionAppPath, ext.outputChannel, ext.ui, telemetryProperties);
        default:
            return new ScriptProjectCreatorBase(functionAppPath, ext.outputChannel, ext.ui, telemetryProperties);
    }
}
