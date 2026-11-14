/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { window, workspace, type WorkspaceFolder } from 'vscode';
import { latestGAVersion, type FuncVersion } from '../../FuncVersion';
import { funcVersionSetting, projectLanguageModelSetting, projectLanguageSetting, projectTemplateKeySetting, type ProjectLanguage } from '../../constants';
import { NoWorkspaceError } from '../../errors';
import { tryGetLocalFuncVersion } from '../../funcCoreTools/tryGetLocalFuncVersion';
import { localize } from '../../localize';
import { isPathEqual } from '../../utils/fs';
import { getContainingWorkspace } from '../../utils/workspace';
import { getGlobalSetting } from '../../vsCodeConfig/settings';
import { type IProjectWizardContext } from '../createNewProject/IProjectWizardContext';
import { verifyProjectPath } from '../createNewProject/verifyIsProject';
import { InitVSCodeLanguageStep } from './InitVSCodeLanguageStep';
import { detectProjectLanguage, detectProjectLanguageModel } from './detectProjectLanguage';

type ProjectInitializationOptions = Pick<IProjectWizardContext, 'preserveExistingConfig' | 'connectorTriggerEvents'>;

export async function initProjectForVSCode(context: IActionContext, fsPath?: string, language?: ProjectLanguage): Promise<void> {
    let workspaceFolder: WorkspaceFolder | undefined;
    let workspacePath: string;
    if (fsPath === undefined) {
        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            throw new NoWorkspaceError();
        } else {
            const placeHolder: string = localize('selectFunctionAppFolderNew', 'Select the folder to initialize for use with VS Code');
            workspaceFolder = await window.showWorkspaceFolderPick({ placeHolder });
            if (!workspaceFolder) {
                throw new UserCancelledError('selectFunctionAppFolderNew');
            } else {
                workspacePath = workspaceFolder.uri.fsPath;
            }
        }
    } else {
        workspaceFolder = getContainingWorkspace(fsPath);
        workspacePath = workspaceFolder ? workspaceFolder.uri.fsPath : fsPath;
    }

    const projectPath: string | undefined = await verifyProjectPath(context, workspaceFolder || workspacePath);
    if (!projectPath) {
        return;
    }

    await initializeProject(context, projectPath, workspacePath, workspaceFolder, language);
}

/**
 * Initializes a known project root without discovering another project in a containing workspace.
 */
export async function initProjectForVSCodeAtProjectRoot(
    context: IActionContext, projectPath: string, language?: ProjectLanguage, options?: ProjectInitializationOptions,
): Promise<void> {
    const workspaceFolder = workspace.workspaceFolders?.find(folder => isPathEqual(folder.uri.fsPath, projectPath));
    await initializeProject(context, projectPath, projectPath, workspaceFolder, language, options);
}

async function initializeProject(
    context: IActionContext, projectPath: string, workspacePath: string, workspaceFolder: WorkspaceFolder | undefined, language?: ProjectLanguage,
    options?: ProjectInitializationOptions,
): Promise<void> {
    language = language || getGlobalSetting(projectLanguageSetting) || await detectProjectLanguage(context, projectPath);
    const languageModel: number | undefined = getGlobalSetting(projectLanguageModelSetting) || await detectProjectLanguageModel(language, projectPath);
    const version: FuncVersion = getGlobalSetting(funcVersionSetting) || await tryGetLocalFuncVersion(context, workspacePath) || latestGAVersion;
    const projectTemplateKey: string | undefined = getGlobalSetting(projectTemplateKeySetting);

    const wizardContext: IProjectWizardContext = Object.assign(context, {
        projectPath, workspacePath, language, languageModel, version, workspaceFolder, projectTemplateKey,
        preserveExistingConfig: options?.preserveExistingConfig,
        connectorTriggerEvents: options?.connectorTriggerEvents,
    });
    const wizard = new AzureWizard<IProjectWizardContext>(wizardContext, { promptSteps: [new InitVSCodeLanguageStep()] });
    await wizard.prompt();
    await wizard.execute();

    // don't wait
    void window.showInformationMessage(localize('finishedInitializing', 'Finished initializing for use with VS Code.'));
}
