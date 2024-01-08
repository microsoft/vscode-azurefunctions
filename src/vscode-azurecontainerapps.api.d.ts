/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface AzureContainerAppsExtensionApi {
    apiVersion: string;

    deployWorkspaceProject(options: DeployWorkspaceProjectOptionsContract): Promise<DeployWorkspaceProjectResults>;
}

export interface DeployWorkspaceProjectOptionsContract {
    // Existing resources
    subscriptionId?: string;
    resourceGroupId?: string;

    // Workspace deployment paths (absolute fs path)
    rootPath?: string;
    srcPath?: string;
    dockerfilePath?: string;

    // Options
    suppressConfirmation?: boolean;  // Suppress any [resource] confirmation prompts
    suppressContainerAppCreation?: boolean;
    ignoreExistingDeploySettings?: boolean;
    shouldSaveDeploySettings?: boolean;
}

export interface DeployWorkspaceProjectResults {
    resourceGroupId?: string;
    logAnalyticsWorkspaceId?: string;
    managedEnvironmentId?: string;
    containerAppId?: string;

    // ACR
    registryId?: string;
    registryLoginServer?: string;
    registryUsername?: string;
    registryPassword?: string;
    imageName?: string;
}
