/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, UserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { latestGAVersion, tryParseFuncVersion } from '../../FuncVersion';
import { funcVersionSetting, projectLanguageSetting, projectOpenBehaviorSetting, projectTemplateKeySetting, type ProjectLanguage } from '../../constants';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { tryGetLocalFuncVersion } from '../../funcCoreTools/tryGetLocalFuncVersion';
import { validateFuncCoreToolsInstalled } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../../localize';
import { createActivityContext } from '../../utils/activityUtils';
import { getGlobalSetting, getWorkspaceSetting } from '../../vsCodeConfig/settings';
import type * as api from '../../vscode-azurefunctions.api';
import { type IFunctionWizardContext } from '../createFunction/IFunctionWizardContext';
import { FolderListStep } from './FolderListStep';
import { NewProjectLanguageStep } from './NewProjectLanguageStep';
import { OpenBehaviorStep } from './OpenBehaviorStep';
import { OpenFolderStep } from './OpenFolderStep';
import { CreateDockerfileProjectStep } from './dockerfileSteps/CreateDockerfileProjectStep';

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

export async function createNewProjectInternal(context: IActionContext, options: api.ICreateFunctionOptions & {
    externalRuntimeConfig?: {
        runtimeName: string;
        runtimeVersion: string;
    };
}): Promise<void> {
    addLocalFuncTelemetry(context, undefined);

    const language: ProjectLanguage | undefined = <ProjectLanguage>options.language || getGlobalSetting(projectLanguageSetting);
    const version: string = options.version || getGlobalSetting(funcVersionSetting) || await tryGetLocalFuncVersion(context, undefined) || latestGAVersion;
    const projectTemplateKey: string | undefined = getGlobalSetting(projectTemplateKeySetting);
    const wizardContext: Partial<IFunctionWizardContext> & IActionContext = Object.assign(
        context,
        options,
        {
            language,
            version: tryParseFuncVersion(version),
            projectTemplateKey,
            externalRuntimeConfig: options.externalRuntimeConfig
        },
        await createActivityContext()
    );

    wizardContext.activityChildren = [];

    const optionalExecuteStep = options.executeStep;

    if (optionalExecuteStep instanceof CreateDockerfileProjectStep) {
        const message: string = localize('installFuncTools', 'You must have the Azure Functions Core Tools installed to run this command.');
        if (!await validateFuncCoreToolsInstalled(context, message)) {
            throw new UserCancelledError('validateFuncCoreToolsInstalled');
        }
        wizardContext.containerizedProject = true;
    }

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
    wizardContext.activityTitle = localize('creatingProject', 'Create new {0} project in "{1}"', wizardContext.language, wizardContext.projectPath);
    await wizard.execute();

    await ext.rgApi.workspaceResourceTree.refresh(context);
}
