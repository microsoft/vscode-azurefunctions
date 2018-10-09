/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { ProgressLocation, QuickPickItem, QuickPickOptions, Uri, window, workspace, WorkspaceConfiguration } from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { DefaultFilesExcluded, ProjectLanguage, projectLanguageSetting, ProjectRuntime } from '../../constants';
import { ext } from '../../extensionVariables';
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../../localize';
import { getFuncExtensionSetting, getGlobalFuncExtensionSetting } from '../../ProjectSettings';
import { gitUtils } from '../../utils/gitUtils';
import * as workspaceUtil from '../../utils/workspace';
import { createFunction } from '../createFunction/createFunction';
import { CSharpProjectCreator } from './CSharpProjectCreator';
import { CSharpScriptProjectCreator } from './CSharpScriptProjectCreator';
import { initProjectForVSCode } from './initProjectForVSCode';
import { ProjectCreatorBase } from './IProjectCreator';
import { JavaProjectCreator } from './JavaProjectCreator';
import { JavaScriptProjectCreator } from './JavaScriptProjectCreator';
import { PythonProjectCreator } from './PythonProjectCreator';
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

            if (getFuncExtensionSetting('enablePython')) {
                languagePicks.push({ label: ProjectLanguage.Python, description: '(Preview)' });
            }

            const options: QuickPickOptions = { placeHolder: localize('azFunc.selectFuncTemplate', 'Select a language for your function project') };
            language = (await ext.ui.showQuickPick(languagePicks, options)).label;
        }
    }
    actionContext.properties.projectLanguage = language;

    await window.withProgress({ location: ProgressLocation.Notification, title: localize('creating', 'Creating new project...') }, async () => {
        // tslint:disable-next-line:no-non-null-assertion
        functionAppPath = functionAppPath!;
        // tslint:disable-next-line:no-non-null-assertion
        language = language!;

        const projectCreator: ProjectCreatorBase = getProjectCreator(language, functionAppPath, actionContext);
        await projectCreator.addNonVSCodeFiles();

        await initProjectForVSCode(actionContext, functionAppPath, language, runtime, projectCreator);
        // Functions has a dependency on C# that creates build artifacts: https://github.com/Microsoft/vscode-azurefunctions/issues/658
        if (language !== ProjectLanguage.CSharp) {
            await addToFilesExclude(['bin', 'obj'], functionAppPath);
        }

        if (await gitUtils.isGitInstalled(functionAppPath) && !await gitUtils.isInsideRepo(functionAppPath)) {
            await gitUtils.gitInit(ext.outputChannel, functionAppPath);
        }

        if (templateId) {
            await createFunction(actionContext, functionAppPath, templateId, functionName, caseSensitiveFunctionSettings, <ProjectLanguage>language, <ProjectRuntime>runtime);
        }
    });
    // don't wait
    window.showInformationMessage(localize('finishedCreating', 'Finished creating project.'));

    // don't wait
    // tslint:disable-next-line:no-floating-promises
    validateFuncCoreToolsInstalled();

    if (openFolder) {
        await workspaceUtil.ensureFolderIsOpen(functionAppPath, actionContext);
    }
}

export function getProjectCreator(language: string, functionAppPath: string, actionContext: IActionContext): ProjectCreatorBase {
    switch (language) {
        case ProjectLanguage.Java:
            return new JavaProjectCreator(functionAppPath, actionContext);
        case ProjectLanguage.JavaScript:
            return new JavaScriptProjectCreator(functionAppPath, actionContext.properties);
        case ProjectLanguage.CSharp:
            return new CSharpProjectCreator(functionAppPath, actionContext.properties);
        case ProjectLanguage.CSharpScript:
            return new CSharpScriptProjectCreator(functionAppPath, actionContext.properties);
        case ProjectLanguage.Python:
            return new PythonProjectCreator(functionAppPath, actionContext.properties);
        default:
            return new ScriptProjectCreatorBase(functionAppPath, actionContext.properties);
    }
}

async function addToFilesExclude(filesToExclude: string | string[], fsPath: string): Promise<void> {
    const projectConfiguration: WorkspaceConfiguration = workspace.getConfiguration('files', Uri.file(fsPath));
    // tslint:disable:no-any no-unsafe-any
    let excludedFiles: any | undefined = projectConfiguration.get('exclude');
    if (excludedFiles) {
        for (const key of Object.keys(DefaultFilesExcluded)) {
            delete excludedFiles[DefaultFilesExcluded[key]];
        }
    } else {
        excludedFiles = {};
    }

    if (filesToExclude.length > 0) {
        for (const file of filesToExclude) {
            excludedFiles[file] = true;
        }
    } else {
        excludedFiles.filesToExclude = true;
    }
    await projectConfiguration.update('exclude', excludedFiles, false);
}
