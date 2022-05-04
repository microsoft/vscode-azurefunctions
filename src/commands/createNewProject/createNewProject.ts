/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, IActionContext } from '@microsoft/vscode-azext-utils';
import { window } from 'vscode';
import { funcVersionSetting, ProjectLanguage, projectLanguageSetting, projectOpenBehaviorSetting, projectTemplateKeySetting } from '../../constants';
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
    addLocalFuncTelemetry(context, undefined);

    const language: ProjectLanguage | undefined = <ProjectLanguage>options.language || getGlobalSetting(projectLanguageSetting);
    const version: string = options.version || getGlobalSetting(funcVersionSetting) || await tryGetLocalFuncVersion(context, undefined) || latestGAVersion;
    const projectTemplateKey: string | undefined = getGlobalSetting(projectTemplateKeySetting);
    const wizardContext: Partial<IFunctionWizardContext> & IActionContext = Object.assign(context, options, { language, version: tryParseFuncVersion(version), projectTemplateKey });
    const optionalExecuteStep = options.executeStep;

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
        ...(optionalExecuteStep !== undefined ? { executeSteps: [optionalExecuteStep, new OpenFolderStep()] } : { executeSteps: [new OpenFolderStep()] }),
    });
    await wizard.prompt();
    await wizard.execute();

    // don't wait
    void window.showInformationMessage(localize('finishedCreating', 'Finished creating project.'));
}
