/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { ProgressLocation, QuickPickItem, QuickPickOptions, window } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage, projectLanguageSetting, ProjectRuntime } from '../../constants';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { convertStringToRuntime, getGlobalFuncExtensionSetting } from '../../ProjectSettings';
import { gitUtils } from '../../utils/gitUtils';
import * as workspaceUtil from '../../utils/workspace';
import { createFunction } from '../createFunction/createFunction';
import { CSharpScriptProjectCreator } from './CSharpScriptProjectCreator';
import { DotnetProjectCreator } from './DotnetProjectCreator';
import { initProjectForVSCode } from './initProjectForVSCode';
import { JavaProjectCreator } from './JavaProjectCreator';
import { JavaScriptProjectCreator } from './JavaScriptProjectCreator';
import { PowerShellProjectCreator } from './PowerShellProjectCreator';
import { ProjectCreatorBase } from './ProjectCreatorBase';
import { PythonProjectCreator } from './PythonProjectCreator';
import { ScriptProjectCreatorBase } from './ScriptProjectCreatorBase';
import { TypeScriptProjectCreator } from './TypeScriptProjectCreator';

export async function createNewProject(
    actionContext: IActionContext,
    functionAppPath?: string,
    language?: string,
    runtime?: string,
    openFolder: boolean = true,
    templateId?: string,
    functionName?: string,
    caseSensitiveFunctionSettings?: { [key: string]: string | undefined }): Promise<void> {
    addLocalFuncTelemetry(actionContext);

    if (functionAppPath === undefined) {
        functionAppPath = await workspaceUtil.selectWorkspaceFolder(ext.ui, localize('azFunc.selectFunctionAppFolderNew', 'Select the folder that will contain your function project'));
    }
    await fse.ensureDir(functionAppPath);

    if (!language) {
        language = getGlobalFuncExtensionSetting(projectLanguageSetting);

        if (!language) {
            const previewDescription: string = localize('previewDescription', '(Preview)');
            // Only display 'supported' languages that can be debugged in VS Code
            const languagePicks: QuickPickItem[] = [
                { label: ProjectLanguage.JavaScript },
                { label: ProjectLanguage.TypeScript },
                { label: ProjectLanguage.CSharp },
                { label: ProjectLanguage.Python, description: previewDescription },
                { label: ProjectLanguage.Java }
            ];

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

        const projectCreator: ProjectCreatorBase = getProjectCreator(language, functionAppPath, actionContext, convertStringToRuntime(runtime));
        await projectCreator.onCreateNewProject();

        await initProjectForVSCode(actionContext, functionAppPath, language, projectCreator);
        if (await gitUtils.isGitInstalled(functionAppPath) && !await gitUtils.isInsideRepo(functionAppPath)) {
            await gitUtils.gitInit(ext.outputChannel, functionAppPath);
        }

        if (templateId) {
            const projectRuntime: ProjectRuntime = await projectCreator.getRuntime();
            await createFunction(actionContext, functionAppPath, templateId, functionName, caseSensitiveFunctionSettings, <ProjectLanguage>language, projectRuntime);
        }
    });
    // don't wait
    window.showInformationMessage(localize('finishedCreating', 'Finished creating project.'));

    // ensureFolderIsOpen sometimes restarts the extension host. Adding a second event here to see if we're losing any telemetry
    await callWithTelemetryAndErrorHandling('azureFunctions.createNewProjectStarted', function (this: IActionContext): void {
        Object.assign(this, actionContext);
    });

    if (openFolder) {
        await workspaceUtil.ensureFolderIsOpen(functionAppPath, actionContext);
    }
}

export function getProjectCreator(language: string, functionAppPath: string, actionContext: IActionContext, runtime: ProjectRuntime | undefined): ProjectCreatorBase {
    let projectCreatorType: new (functionAppPath: string, actionContext: IActionContext, runtime: ProjectRuntime | undefined, language: string) => ProjectCreatorBase;
    switch (language) {
        case ProjectLanguage.Java:
            projectCreatorType = JavaProjectCreator;
            break;
        case ProjectLanguage.JavaScript:
            projectCreatorType = JavaScriptProjectCreator;
            break;
        case ProjectLanguage.CSharp:
        case ProjectLanguage.FSharp:
            projectCreatorType = DotnetProjectCreator;
            break;
        case ProjectLanguage.CSharpScript:
            projectCreatorType = CSharpScriptProjectCreator;
            break;
        case ProjectLanguage.Python:
            projectCreatorType = PythonProjectCreator;
            break;
        case ProjectLanguage.TypeScript:
            projectCreatorType = TypeScriptProjectCreator;
            break;
        case ProjectLanguage.PowerShell:
            projectCreatorType = PowerShellProjectCreator;
            break;
        default:
            projectCreatorType = ScriptProjectCreatorBase;
            break;
    }

    return new projectCreatorType(functionAppPath, actionContext, runtime, language);
}
