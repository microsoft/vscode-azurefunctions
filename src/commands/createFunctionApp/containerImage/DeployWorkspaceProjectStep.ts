/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { type DeployWorkspaceProjectApiOptionsContract } from "../../../vscode-azurecontainerapps.api";
import { type IFunctionAppWizardContext } from "../IFunctionAppWizardContext";

export class DeployWorkspaceProjectStep extends AzureWizardExecuteStep<IFunctionAppWizardContext> {
    public priority: number = 137;

    public async execute(context: IFunctionAppWizardContext): Promise<void> {
        const commandOptions: DeployWorkspaceProjectApiOptionsContract = {
            resourceGroupId: context.resourceGroup?.id,
            dockerfilePath: context.dockerfilePath,
            rootPath: context.rootPath,
            skipContainerAppCreation: true,
            shouldSaveDeploySettings: false
        }
        context.deployWorkspaceResult = await vscode.commands.executeCommand('containerApps.deployWorkspaceProjectApi', commandOptions)
    }

    public shouldExecute(context: IFunctionAppWizardContext): boolean {
        return !!context.dockerfilePath
    }
}
