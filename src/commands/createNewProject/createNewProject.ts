/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window } from 'vscode';
import { AzureWizard, IActionContext } from 'vscode-azureextensionui';
import { funcVersionSetting, ProjectLanguage, projectLanguageSetting, projectOpenBehaviorSetting } from '../../constants';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { tryGetLocalFuncVersion } from '../../funcCoreTools/tryGetLocalFuncVersion';
import { latestGAVersion, tryParseFuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import * as api from '../../vscode-azurefunctions.api';
import { getGlobalSetting, getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { IFunctionWizardContext } from '../createFunction/IFunctionWizardContext';
import { FolderListStep } from './FolderListStep';
import { NewProjectLanguageStep } from './NewProjectLanguageStep';
import { OpenBehaviorStep } from './OpenBehaviorStep';
import { OpenFolderStep } from './OpenFolderStep';

/**
 * @deprecated Use AzureFunctionsExtensionApi.createFunction instead
 */
export async function createNewProjectFromCommand(
    context: IActionContext,
    folderPath?: string,
    language?: ProjectLanguage,
    version?: string,
    openFolder: boolean = true,
    templateId?: string,
    functionName?: string,
    functionSettings?: { [key: string]: string | undefined }): Promise<void> {

    await createNewProjectInternal(context, {
        folderPath,
        templateId,
        functionName,
        functionSettings,
        suppressOpenFolder: !openFolder,
        language: <api.ProjectLanguage>language,
        version: <api.ProjectVersion>version
    });
}

export async function createNewProjectInternal(context: IActionContext, options: api.ICreateFunctionOptions): Promise<void> {
    addLocalFuncTelemetry(context);

    // tslint:disable-next-line: strict-boolean-expressions
    const language: string | undefined = options.language || getGlobalSetting(projectLanguageSetting);
    // tslint:disable-next-line: strict-boolean-expressions
    const version: string = options.version || getGlobalSetting(funcVersionSetting) || await tryGetLocalFuncVersion() || latestGAVersion;

    const wizardContext: Partial<IFunctionWizardContext> & IActionContext = Object.assign(context, options, { language, version: tryParseFuncVersion(version) });

    if (options.folderPath) {
        FolderListStep.setProjectPath(wizardContext, options.folderPath);
    }

    if (options.suppressOpenFolder) {
        wizardContext.openBehavior = 'DontOpen';
    } else if (!wizardContext.openBehavior) {
        wizardContext.openBehavior = getWorkspaceSetting(projectOpenBehaviorSetting);
        context.telemetry.properties.openBehaviorFromSetting = String(!!wizardContext.openBehavior);
    }

    const wizard: AzureWizard<IFunctionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('createNewProject', 'Create new project'),
        promptSteps: [new FolderListStep(), new NewProjectLanguageStep(options.templateId, options.functionSettings), new OpenBehaviorStep()],
        executeSteps: [new OpenFolderStep()]
    });
    await wizard.prompt();
    await wizard.execute();

    // don't wait
    window.showInformationMessage(localize('finishedCreating', 'Finished creating project.'));
}
