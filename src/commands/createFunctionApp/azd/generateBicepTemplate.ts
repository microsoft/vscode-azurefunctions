/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebsiteOS } from '@microsoft/vscode-azext-azureappservice';
import { nonNullProp } from '@microsoft/vscode-azext-utils';
import { getMajorVersion } from '../../../FuncVersion';
import { type FullFunctionAppStack, type IFlexFunctionAppWizardContext, type IFunctionAppWizardContext } from '../IFunctionAppWizardContext';

/**
 * Determines the hosting plan type string used in Bicep parameters
 * based on the wizard context's plan SKU.
 */
function getHostingPlanType(context: IFunctionAppWizardContext): string {
    const tier = context.newPlanSku?.tier?.toLowerCase();
    switch (tier) {
        case 'dynamic':
            return 'consumption';
        case 'flexconsumption':
            return 'flex';
        case 'elasticpremium':
            return 'premium';
        default:
            return 'dedicated';
    }
}

/**
 * Extracts the Function App runtime name and version from the wizard context
 * for use in Bicep parameter values.
 */
function getRuntimeInfo(context: IFlexFunctionAppWizardContext): { runtimeName: string; runtimeVersion: string } {
    if (context.newFlexSku) {
        return {
            runtimeName: context.newFlexSku.functionAppConfigProperties.runtime.name,
            runtimeVersion: context.newFlexSku.functionAppConfigProperties.runtime.version,
        };
    }

    const stack: FullFunctionAppStack = nonNullProp(context, 'newSiteStack');
    const os: WebsiteOS = nonNullProp(context, 'newSiteOS');
    const stackSettings = os === WebsiteOS.linux
        ? stack.minorVersion.stackSettings.linuxRuntimeSettings
        : stack.minorVersion.stackSettings.windowsRuntimeSettings;

    const workerRuntime = stackSettings?.appSettingsDictionary?.FUNCTIONS_WORKER_RUNTIME ?? stack.stack.value;
    // Extract version from the linuxFxVersion (e.g., "NODE|20") or similar
    const linuxFxVersion = stackSettings?.siteConfigPropertiesDictionary?.linuxFxVersion;
    let runtimeVersion = stack.majorVersion.value;

    if (linuxFxVersion) {
        const parts = linuxFxVersion.split('|');
        if (parts.length === 2) {
            runtimeVersion = parts[1];
        }
    }

    return {
        runtimeName: workerRuntime,
        runtimeVersion: runtimeVersion,
    };
}

/**
 * Resolves the App Service Plan SKU object for Bicep based on the hosting plan type
 * and the user-selected SKU from the wizard context.
 */
function getPlanSkuBicep(context: IFunctionAppWizardContext, hostingPlanType: string): string {
    const sku = context.newPlanSku;
    if (sku) {
        return `{
    name: '${sku.name ?? 'Y1'}'
    tier: '${sku.tier ?? 'Dynamic'}'
    size: '${sku.size ?? sku.name ?? 'Y1'}'
    family: '${sku.family ?? 'Y'}'
    capacity: ${sku.capacity ?? 0}
  }`;
    }

    // Fallback defaults by plan type
    switch (hostingPlanType) {
        case 'consumption':
            return `{ name: 'Y1', tier: 'Dynamic', size: 'Y1', family: 'Y', capacity: 0 }`;
        case 'flex':
            return `{ name: 'FC1', tier: 'FlexConsumption', size: 'FC', family: 'FC' }`;
        case 'premium':
            return `{ name: 'EP1', tier: 'ElasticPremium', size: 'EP1', family: 'EP', capacity: 1 }`;
        default:
            return `{ name: 'B1', tier: 'Basic', size: 'B1', family: 'B', capacity: 1 }`;
    }
}

export interface BicepGenerationResult {
    /** The main.bicep content (subscription-scoped, creates RG and calls module) */
    bicepContent: string;
    /** The resources.bicep module content (resource-group-scoped, all resources) */
    resourcesBicepContent: string;
    /** The parameters JSON content */
    parametersContent: string;
}

/**
 * Generates a Bicep template and parameters file from the wizard context.
 * The template provisions all resources needed for a Function App:
 * - Storage Account
 * - Log Analytics Workspace
 * - Application Insights
 * - App Service Plan
 * - Function App
 * - (Optional) User-assigned Managed Identity + role assignment
 */
export function generateBicepTemplate(context: IFlexFunctionAppWizardContext): BicepGenerationResult {
    const siteName = nonNullProp(context, 'newSiteName');
    const hostingPlanType = getHostingPlanType(context);
    const isLinux = context.newSiteOS === WebsiteOS.linux;
    const isFlex = hostingPlanType === 'flex';
    const isConsumption = hostingPlanType === 'consumption';
    const isPremium = hostingPlanType === 'premium';
    const useManagedIdentity = context.useManagedIdentity === true;
    const disableSharedKeyAccess = useManagedIdentity && isFlex;
    const { runtimeName, runtimeVersion } = getRuntimeInfo(context);
    const functionsVersion = getMajorVersion(context.version);

    const storageAccountName = context.newStorageAccountName ?? siteName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 24);
    const rgName = context.newResourceGroupName ?? context.resourceGroup?.name ?? siteName;
    const planName = context.newPlanName ?? `ASP-${siteName}`;
    const appInsightsName = context.newAppInsightsName ?? siteName;

    const flexInstanceMemoryMB = (context as IFlexFunctionAppWizardContext).newFlexInstanceMemoryMB ?? 2048;
    const flexMaxInstanceCount = (context as IFlexFunctionAppWizardContext).newFlexMaximumInstanceCount ?? 100;

    const siteKind = isLinux ? 'functionapp,linux' : 'functionapp';

    // main.bicep — subscription-scoped, creates the RG then deploys resources via a module
    const bicepContent = `// Auto-generated Bicep template for Azure Function App provisioning
// Generated by Azure Functions VS Code extension
targetScope = 'subscription'

@description('Name of the resource group')
param resourceGroupName string

@description('Name of the function app')
param functionAppName string

@description('Name of the storage account')
param storageAccountName string

@description('Name of the App Service Plan')
param appServicePlanName string

@description('Name of the Application Insights instance')
param appInsightsName string

@description('Primary location for all resources')
param location string

@description('Use managed identity for storage access')
param useManagedIdentity bool = ${useManagedIdentity}

// ========== Resource Group ==========
resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

// ========== Deploy all resources into the resource group ==========
module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    functionAppName: functionAppName
    storageAccountName: storageAccountName
    appServicePlanName: appServicePlanName
    appInsightsName: appInsightsName
    location: location
    useManagedIdentity: useManagedIdentity
  }
}

// ========== Outputs ==========
output AZURE_RESOURCE_GROUP string = rg.name
output functionAppName string = resources.outputs.functionAppName
output functionAppId string = resources.outputs.functionAppId
output functionAppDefaultHostName string = resources.outputs.functionAppDefaultHostName
output storageAccountName string = resources.outputs.storageAccountName
output storageAccountId string = resources.outputs.storageAccountId
output appInsightsName string = resources.outputs.appInsightsName
output appInsightsConnectionString string = resources.outputs.appInsightsConnectionString${useManagedIdentity ? `
output managedIdentityPrincipalId string = resources.outputs.managedIdentityPrincipalId
output managedIdentityClientId string = resources.outputs.managedIdentityClientId
output managedIdentityId string = resources.outputs.managedIdentityId` : ''}
`;

    // resources.bicep — resource-group-scoped module with all the actual resources
    const resourcesBicepContent = `// Auto-generated Bicep module for Azure Function App resources
// Generated by Azure Functions VS Code extension
targetScope = 'resourceGroup'

@description('Name of the function app')
param functionAppName string

@description('Name of the storage account')
param storageAccountName string

@description('Name of the App Service Plan')
param appServicePlanName string

@description('Name of the Application Insights instance')
param appInsightsName string

@description('Primary location for all resources')
param location string

@description('Use managed identity for storage access')
param useManagedIdentity bool

// ========== Storage Account ==========
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'Storage'
  properties: {
    supportsHttpsTrafficOnly: true
    defaultToOAuthAuthentication: ${disableSharedKeyAccess}
    allowSharedKeyAccess: ${!disableSharedKeyAccess}
  }
}

${useManagedIdentity ? `// ========== User-Assigned Managed Identity ==========
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${context.newManagedIdentityName ?? `id-${siteName}`}'
  location: location
}

// ========== Storage Blob Data Contributor Role Assignment ==========
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
resource storageBlobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, managedIdentity.id, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}
` : ''}
// ========== Log Analytics Workspace ==========
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'workspace-\${appInsightsName}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ========== Application Insights ==========
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

// ========== App Service Plan ==========
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: ${getPlanSkuBicep(context, hostingPlanType)}
  kind: '${isLinux ? 'linux' : 'app'}'
  properties: {
    reserved: ${isLinux}
  }
}

// ========== Function App ==========
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: '${siteKind}'${useManagedIdentity ? `
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '\${managedIdentity.id}': {}
    }
  }` : ''}
  properties: {
    serverFarmId: appServicePlan.id
    clientAffinityEnabled: false
    httpsOnly: true${isFlex ? `
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '\${storageAccount.properties.primaryEndpoints.blob}app-package-\${toLower(take(functionAppName, 32))}'
          authentication: ${useManagedIdentity ? `{
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: managedIdentity.id
          }` : `{
            type: 'StorageAccountConnectionString'
            storageAccountConnectionStringName: 'DEPLOYMENT_STORAGE_CONNECTION_STRING'
          }`}
        }
      }
      runtime: {
        name: '${runtimeName}'
        version: '${runtimeVersion}'
      }
      scaleAndConcurrency: {
        maximumInstanceCount: ${flexMaxInstanceCount}
        instanceMemoryMB: ${flexInstanceMemoryMB}
      }
    }` : ''}
    siteConfig: {${!isFlex ? `
      ${isLinux ? `linuxFxVersion: '${runtimeName.toUpperCase()}|${runtimeVersion}'` : ''}${!isLinux && runtimeName === 'dotnet' ? `
      netFrameworkVersion: '${runtimeVersion}'` : ''}` : ''}
      appSettings: [${useManagedIdentity ? `
        { name: 'AzureWebJobsStorage__blobServiceUri', value: 'https://\${storageAccount.name}.blob.core.windows.net' }
        { name: 'AzureWebJobsStorage__queueServiceUri', value: 'https://\${storageAccount.name}.queue.core.windows.net' }
        { name: 'AzureWebJobsStorage__tableServiceUri', value: 'https://\${storageAccount.name}.table.core.windows.net' }
        { name: 'AzureWebJobsStorage__clientId', value: managedIdentity.properties.clientId }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }` : `
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=\${storageAccount.name};AccountKey=\${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }`}
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~${functionsVersion}' }${!isFlex ? `
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: '${runtimeName}' }` : ''}
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }${(isConsumption || isPremium) && !useManagedIdentity ? `
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING', value: 'DefaultEndpointsProtocol=https;AccountName=\${storageAccount.name};AccountKey=\${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
        { name: 'WEBSITE_CONTENTSHARE', value: toLower(functionAppName) }` : ''}${!isLinux && !isFlex ? `
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }` : ''}${isFlex && !useManagedIdentity ? `
        { name: 'DEPLOYMENT_STORAGE_CONNECTION_STRING', value: 'DefaultEndpointsProtocol=https;AccountName=\${storageAccount.name};AccountKey=\${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }` : ''}
      ]
    }
  }
}

// ========== Outputs ==========
output functionAppName string = functionApp.name
output functionAppId string = functionApp.id
output functionAppDefaultHostName string = functionApp.properties.defaultHostName
output storageAccountName string = storageAccount.name
output storageAccountId string = storageAccount.id
output appInsightsName string = appInsights.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString${useManagedIdentity ? `
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityId string = managedIdentity.id` : ''}
`;

    const parametersContent = JSON.stringify({
        '$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
        contentVersion: '1.0.0.0',
        parameters: {
            resourceGroupName: { value: rgName },
            functionAppName: { value: siteName },
            storageAccountName: { value: storageAccountName },
            appServicePlanName: { value: planName },
            appInsightsName: { value: appInsightsName },
            location: { value: '${AZURE_LOCATION}' },
            useManagedIdentity: { value: useManagedIdentity },
        }
    }, null, 2);

    return { bicepContent, resourcesBicepContent, parametersContent };
}
