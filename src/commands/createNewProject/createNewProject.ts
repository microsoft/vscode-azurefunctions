/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, IActionContext } from '@microsoft/vscode-azext-utils';
import { window } from 'vscode';
import { latestGAVersion, tryParseFuncVersion } from '../../FuncVersion';
import { ProjectLanguage, funcVersionSetting, projectLanguageSetting, projectOpenBehaviorSetting, projectTemplateKeySetting } from '../../constants';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { tryGetLocalFuncVersion } from '../../funcCoreTools/tryGetLocalFuncVersion';
import { localize } from '../../localize';
import { getGlobalSetting, getWorkspaceSetting } from '../../vsCodeConfig/settings';
import * as api from '../../vscode-azurefunctions.api';
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
    folderPath?: string | unknown,
    language?: ProjectLanguage | unknown[],
    version?: string,
    openFolder: boolean = true,
    templateId?: string,
    functionName?: string,
    functionSettings?: { [key: string]: string | undefined }): Promise<void> {

    await createNewProjectInternal(context, {
        // if a tree element has been selected, it will be passed into the `folderProject` parameter as a BranchDataItemWrapper
        folderPath: typeof folderPath === 'string' ? folderPath : undefined,
        templateId,
        functionName,
        functionSettings,
        suppressOpenFolder: !openFolder,
        // if *multiple* tree elements are selected, they will be passed as an array as the `language` parameter as an array of BranchDataItemWrapper
        language: Array.isArray(language) ? undefined : <api.ProjectLanguage>language,
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
        executeSteps: optionalExecuteStep ? [optionalExecuteStep, new OpenFolderStep()] : [new OpenFolderStep()]
    });
    await wizard.prompt();
    await wizard.execute();

    await ext.rgApi.workspaceResourceTree.refresh(context);
    // don't wait
    void window.showInformationMessage(localize('finishedCreating', 'Finished creating project.'));
}
