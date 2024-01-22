/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { ext } from "../../../extensionVariables";
import { getAzureContainerAppsApi } from "../../../getExtensionApi";
import { localize } from "../../../localize";
import { type IFunctionAppWizardContext } from "../IFunctionAppWizardContext";

export class DeployWorkspaceProjectStep extends AzureWizardExecuteStep<IFunctionAppWizardContext> {
    public priority: number = 137;

    public async execute(context: IFunctionAppWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const message: string = localize('creatingCAResources', 'Creating container resources this may take a few minutes...');
        ext.outputChannel.appendLog(message);
        progress.report({ message });

        const containerAppsApi = await getAzureContainerAppsApi(context);


        context.deployWorkspaceResult = await containerAppsApi.deployWorkspaceProject({
            resourceGroupId: context.resourceGroup?.id,
            rootPath: context.rootPath,
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
