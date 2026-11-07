/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type IActionContext } from '@microsoft/vscode-azext-utils';
import { isWrapper } from '@microsoft/vscode-azureresources-api';
import { type WorkspaceFolder } from 'vscode';
import { type FuncVersion } from '../../FuncVersion';
import { ProjectLanguage, projectTemplateKeySetting } from '../../constants';
import { ext } from '../../extensionVariables';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { LocalProjectTreeItem } from '../../tree/localProject/LocalProjectTreeItem';
import { createActivityContext } from '../../utils/activityUtils';
import { durableUtils } from '../../utils/durableUtils';
import { telemetryUtils } from '../../utils/telemetryUtils';
import { getContainingWorkspace, getRootWorkspaceFolder } from '../../utils/workspace';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { verifyInitForVSCode } from '../../vsCodeConfig/verifyInitForVSCode';
import type * as api from '../../vscode-azurefunctions.api';
import { createNewProjectInternal, routeCreateNewProject } from '../createNewProject/createNewProject';
import { FunctionsTemplateGalleryController } from '../createNewProject/FunctionsTemplateGalleryController';
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

    // Unwrap only the tree argument: unwrapArgs treats the legacy template ID as a multi-selection.
    if (isWrapper(folderPath)) {
        folderPath = folderPath.unwrap();
    }
    if (folderPath instanceof LocalProjectTreeItem) {
        folderPath = folderPath.preCompiledProjectPath || folderPath.effectiveProjectPath;
    } else if (folderPath && typeof folderPath !== 'string') {
        folderPath = undefined;
    }

    await createFunctionInternal(context, {
        folderPath: typeof folderPath === 'string' ? folderPath : undefined,
        templateId: typeof templateId === 'string' ? templateId : undefined,
        functionName,
        functionSettings,
        language: <api.ProjectLanguage>language,
        version: <api.ProjectVersion>version
    }, async (actionContext, options, defaultFolderPath) => {
        await routeCreateNewProject(actionContext, {
            templateId: options.templateId,
            startFromScratch: options.language !== undefined || options.version !== undefined ||
                options.functionName !== undefined || options.functionSettings !== undefined,
        }, {
            createClassicProject: async () => await createNewProjectInternal(actionContext, options),
            showTemplateGallery: () => {
                FunctionsTemplateGalleryController.createOrShow(ext.context, { initialLocation: options.folderPath ?? defaultFolderPath });
            },
        });
    });
}

export async function createFunctionInternal(
    context: IActionContext,
    options: api.ICreateFunctionOptions,
    createProject: (context: IActionContext, options: api.ICreateFunctionOptions, defaultFolderPath?: string) => Promise<void> = createNewProjectInternal,
): Promise<void> {
    context.telemetry.maskEntireErrorMessage = true;
    let workspaceFolder: WorkspaceFolder | undefined;
    let workspacePath: string | undefined = options.folderPath;

    if (workspacePath === undefined) {
        workspaceFolder = await getRootWorkspaceFolder();
        workspacePath = workspaceFolder?.uri.fsPath;
    } else {
        workspaceFolder = getContainingWorkspace(workspacePath);
    }

    addLocalFuncTelemetry(context, workspacePath);

    const projectPath: string | undefined = await verifyProjectPath(context, options.folderPath ?? workspaceFolder ?? workspacePath);
    if (!projectPath) {
        // If we cannot find a valid Functions project, we need to put the user into the 'Create New Project' flow..
        context.telemetry.properties.noWorkspaceResult = 'createNewProject';
        await createProject(context, options, workspacePath);
        return;
    }

    context.telemetry.properties.functionCreationExperience = 'classic';
    context.telemetry.properties.functionCreationRouteReason = 'existingProject';
    const { language, languageModel, version, templateSchemaVersion } = await verifyInitForVSCode(context, projectPath, options.language, options.languageModel, options.version);
    context.telemetry.properties.functionLanguage = telemetryUtils.getProjectLanguage(language);

    if (language === ProjectLanguage.Go) {
        // Go projects scaffold an initial function during "Create New Project" via `func init --worker-runtime go`.
        // Core tools does not yet support `func new --language Go`, so additional functions must be added by editing
        // the source files directly. Show a modal so the user can't miss it.
        context.telemetry.properties.goCreateFunctionUnsupported = 'true';
        await context.ui.showWarningMessage(
            localize('goCreateFunctionUnsupported', 'Adding new functions is currently not supported for Go projects'),
            {
                modal: true,
                detail: localize('goCreateFunctionUnsupportedDetail', 'To add another function, edit the Go source files directly.'),
            },
        );
        return;
    }

    const durableStorageType = await durableUtils.getStorageTypeFromWorkspace(language, projectPath);
    context.telemetry.properties.hasDurableStorageProject = String(!!durableStorageType);
    context.telemetry.properties.durableStorageType = durableStorageType;

    const projectTemplateKey: string | undefined = getWorkspaceSetting(projectTemplateKeySetting, projectPath);
    const wizardContext: IFunctionWizardContext = Object.assign(context, options, await createActivityContext(),
        { projectPath, workspacePath, workspaceFolder, version, language, languageModel, projectTemplateKey, hasDurableStorage: !!durableStorageType, templateSchemaVersion });
    wizardContext.activityTitle = localize('creatingFunction', 'Create function');
    wizardContext.activityChildren = [];

    const wizard = new AzureWizard<IFunctionWizardContext>(wizardContext, {
        promptSteps: [new FunctionListStep({
            templateId: options.templateId,
            functionSettings: options.functionSettings,
            isProjectWizard: false,
        })]
    });
    await wizard.prompt();
    await wizard.execute();
    context.telemetry.properties.functionCreated = 'true';
    context.telemetry.measurements.functionsCreated = 1;
}
