/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { getAzureContainerAppsApi } from "../../../getExtensionApi";
import { localize } from "../../../localize";
import { type IFunctionAppWizardContext } from "../IFunctionAppWizardContext";

export class DeployWorkspaceProjectStep extends AzureWizardExecuteStepWithActivityOutput<IFunctionAppWizardContext> {
    public priority: number = 137;
    public stepName: string = 'deployWorkspaceProjectStep';

    public getOutputLogSuccess(context: IFunctionAppWizardContext): string {
        return localize('deployWorkspaceProjectSuccess', 'Successfully created container resources for "{0}".', context.deployWorkspaceResult?.imageName);
    }
    public getOutputLogFail(_context: IFunctionAppWizardContext): string {
        return localize('deployWorkspaceProjectFail', 'Failed to create container resources.');
    }

    public getOutputLogProgress(_context: IFunctionAppWizardContext): string {
        return localize('deployWorkspaceProjectProgress', 'Creating container resources; this may take a few minutes...');
    }
    public getTreeItemLabel(context: IFunctionAppWizardContext): string {
        return context.deployWorkspaceResult ?
            localize('deployWorkspaceProjectLabel', 'Create container resources for "{0}"', context.deployWorkspaceResult.imageName) :
            localize('deployWorkspaceProjectLabel', 'Create container resources; this may take a few minutes...'); '';
    }

    public async execute(context: IFunctionAppWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const message: string = localize('creatingCAResources', 'Creating container resources; this may take a few minutes...');
        progress.report({ message });

        const containerAppsApi = await getAzureContainerAppsApi(context);

        context.deployWorkspaceResult = await containerAppsApi.deployWorkspaceProject({
            resourceGroupId: context.resourceGroup?.id,
            rootPath: context.rootPath,
            srcPath: context.rootPath,
            dockerfilePath: context.dockerfilePath,
            suppressConfirmation: true,
            suppressContainerAppCreation: true,
            ignoreExistingDeploySettings: true,
            shouldSaveDeploySettings: false
        })
    }

    public shouldExecute(context: IFunctionAppWizardContext): boolean {
        return !!context.dockerfilePath
    }
}
