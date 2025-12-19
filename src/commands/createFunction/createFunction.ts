/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type IActionContext } from '@microsoft/vscode-azext-utils';
import { type WorkspaceFolder } from 'vscode';
import { type FuncVersion } from '../../FuncVersion';
import { projectTemplateKeySetting, type ProjectLanguage } from '../../constants';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { type LocalProjectTreeItem } from '../../tree/localProject/LocalProjectTreeItem';
import { createActivityContext } from '../../utils/activityUtils';
import { durableUtils } from '../../utils/durableUtils';
import { getContainingWorkspace, getRootWorkspaceFolder } from '../../utils/workspace';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import type * as api from '../../vscode-azurefunctions.api';
import { createNewProjectInternal } from '../createNewProject/createNewProject';
import { verifyProjectPath } from '../createNewProject/verifyIsProject';
import { FunctionListStep } from './FunctionListStep';
import { type IFunctionWizardContext } from './IFunctionWizardContext';

/**
 * @deprecated Use AzureFunctionsExtensionApi.createFunction instead
 */
export async function createFunctionFromCommand(
    context: IActionContext,
    folderPath?: string | LocalProjectTreeItem | unknown,
    templateId?: string | unknown[],
    functionName?: string,
    functionSettings?: { [key: string]: string | undefined },
    language?: ProjectLanguage,
    version?: FuncVersion): Promise<void> {

    if (folderPath && typeof folderPath !== 'string') {
        folderPath = undefined;
    }

    await createFunctionInternal(context, {
        // if a tree element has been selected, it will be passed into the `folderProject` parameter as a BranchDataItemWrapper
        folderPath: typeof folderPath === 'string' ? folderPath : undefined,
        // if *multiple* tree elements are selected, they will be passed as an array as the `language` parameter as an array of BranchDataItemWrapper
        templateId: typeof templateId === 'string' ? templateId : undefined,
        functionName,
        functionSettings,
        language: <api.ProjectLanguage>language,
        version: <api.ProjectVersion>version
    });
}

export async function createFunctionInternal(context: IActionContext, options: api.ICreateFunctionOptions): Promise<void> {
    let workspaceFolder: WorkspaceFolder | undefined;
    let workspacePath: string | undefined = options.folderPath;

    if (workspacePath === undefined) {
        workspaceFolder = await getRootWorkspaceFolder(context);
        workspacePath = workspaceFolder?.uri.fsPath;
    } else {
        workspaceFolder = getContainingWorkspace(workspacePath);
    }

    addLocalFuncTelemetry(context, workspacePath);

    const projectPath: string | undefined = await verifyProjectPath(context, workspaceFolder || workspacePath);
    if (!projectPath) {
        // If we cannot find a valid Functions project, we need to put the user into the 'Create New Project' flow..
        context.telemetry.properties.noWorkspaceResult = 'createNewProject';
        await createNewProjectInternal(context, options);
        return;
    }

    const { language, languageModel, version, templateSchemaVersion } = await verifyInitForVSCode(context, projectPath, options.language, options.languageModel, options.version);
    const durableStorageType = await durableUtils.getStorageTypeFromWorkspace(language, projectPath);
    context.telemetry.properties.hasDurableStorageProject = String(!!durableStorageType);
    context.telemetry.properties.durableStorageType = durableStorageType;

    const projectTemplateKey: string | undefined = getWorkspaceSetting(projectTemplateKeySetting, projectPath);
    const wizardContext: IFunctionWizardContext = Object.assign(context, options, await createActivityContext(),
        { projectPath, workspacePath, workspaceFolder, version, language, languageModel, projectTemplateKey, hasDurableStorage: !!durableStorageType, templateSchemaVersion });
    wizardContext.activityTitle = localize('creatingFunction', 'Create function');
    wizardContext.activityChildren = [];

    const wizard: AzureWizard<IFunctionWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [new FunctionListStep({
            templateId: options.templateId,
            functionSettings: options.functionSettings,
            isProjectWizard: false,
        })]
    });
    await wizard.prompt();
    await wizard.execute();

    console.log("test")
}
