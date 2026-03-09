/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type StringDictionary } from '@azure/arm-appservice';

export interface BicepFromSiteResult {
    /** The main.bicep content (resource-group-scoped, all resources inline) */
    bicepContent: string;
    /** The parameters JSON content */
    parametersContent: string;
}

/**
 * Extracts the storage account name from app settings.
 * Checks both managed identity (URI) and connection string patterns.
 */
function deriveStorageAccountName(appSettings: StringDictionary, fallbackName: string): string {
    const blobUri = appSettings?.properties?.['AzureWebJobsStorage__blobServiceUri'];
    if (blobUri) {
        const match = blobUri.match(/https:\/\/([^.]+)\./);
        if (match?.[1]) { return match[1]; }
    }

    const connString = appSettings?.properties?.AzureWebJobsStorage;
    if (connString) {
        const match = connString.match(/AccountName=([^;]+)/i);
        if (match?.[1]) { return match[1]; }
    }

    return fallbackName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 24);
}

/**
 * Parses the linuxFxVersion string (e.g. "NODE|20") into runtime name and version.
 */
function parseLinuxFxVersion(linuxFxVersion?: string): { runtimeName: string; runtimeVersion: string } | undefined {
    if (!linuxFxVersion) { return undefined; }
    const parts = linuxFxVersion.split('|');
    if (parts.length !== 2) { return undefined; }
    return { runtimeName: parts[0].toLowerCase(), runtimeVersion: parts[1] };
}

/**
 * Determines the runtime name and version from the site envelope and app settings.
 */
function getRuntimeFromSite(site: Site, appSettings: StringDictionary): { runtimeName: string; runtimeVersion: string } {
    // Flex consumption has explicit runtime config
    if (site.functionAppConfig?.runtime) {
        return {
            runtimeName: site.functionAppConfig.runtime.name ?? 'node',
            runtimeVersion: site.functionAppConfig.runtime.version ?? '20',
        };
    }

    // Try linuxFxVersion from site config
    const parsed = parseLinuxFxVersion(site.siteConfig?.linuxFxVersion);
    if (parsed) { return parsed; }

    // Fall back to app settings
    const workerRuntime = appSettings?.properties?.FUNCTIONS_WORKER_RUNTIME ?? 'node';
    return { runtimeName: workerRuntime, runtimeVersion: '20' };
}

/**
 * Determines the App Service Plan SKU Bicep fragment based on site properties.
 * Without an actual API call to the server farm, we infer the plan type from the site.
 */
function inferPlanSkuBicep(site: Site): string {
    // Flex consumption detected via functionAppConfig
    if (site.functionAppConfig) {
        return `{ name: 'FC1', tier: 'FlexConsumption', size: 'FC', family: 'FC' }`;
    }

    // Elastic Premium detected via kind containing 'elastic'
    if (site.kind?.toLowerCase().includes('elastic')) {
        return `{ name: 'EP1', tier: 'ElasticPremium', size: 'EP1', family: 'EP', capacity: 1 }`;
    }

    // Default to Consumption (Y1/Dynamic) — adjust in generated template if needed
    return `{ name: 'Y1', tier: 'Dynamic', size: 'Y1', family: 'Y', capacity: 0 }`;
}

/**
 * Generates a Bicep template and parameters file from an existing Function App's
 * site envelope and app settings. This mirrors the existing infrastructure so that
 * the generated template can be used with `azd deploy` or `azd up`.
 *
 * Resources defined:
 * - Storage Account
 * - Log Analytics Workspace
 * - Application Insights
 * - App Service Plan
 * - Function App
 * - (Optional) User-assigned Managed Identity + role assignment
 */
export function generateBicepFromSite(site: Site, appSettings: StringDictionary): BicepFromSiteResult {
    const siteName = site.name ?? 'unknown';
    const isLinux = site.kind?.includes('linux') ?? false;
    const siteKind = isLinux ? 'functionapp,linux' : 'functionapp';
    const isFlex = !!site.functionAppConfig;

    // Parse plan name from serverFarmId
    const planName = site.serverFarmId?.split('/').pop() ?? `ASP-${siteName}`;

    // Managed identity detection
    const hasManagedIdentity = site.identity?.type?.toLowerCase().includes('userassigned') ?? false;
    const identityIds = site.identity?.userAssignedIdentities ? Object.keys(site.identity.userAssignedIdentities) : [];
    const identityName = identityIds.length > 0 ? identityIds[0].split('/').pop() ?? `id-${siteName}` : `id-${siteName}`;
    const disableSharedKeyAccess = hasManagedIdentity && isFlex;

    // Runtime info
    const { runtimeName, runtimeVersion } = getRuntimeFromSite(site, appSettings);
    const workerRuntime = appSettings?.properties?.FUNCTIONS_WORKER_RUNTIME ?? runtimeName;
    const functionsExtVersion = appSettings?.properties?.FUNCTIONS_EXTENSION_VERSION ?? '~4';
    const functionsVersion = functionsExtVersion.replace('~', '');

    // Resource names derived from existing app
    const storageAccountName = deriveStorageAccountName(appSettings, siteName);
    const appInsightsName = siteName; // convention

    // Flex consumption details
    const flexInstanceMemoryMB = site.functionAppConfig?.scaleAndConcurrency?.instanceMemoryMB ?? 2048;
    const flexMaxInstanceCount = site.functionAppConfig?.scaleAndConcurrency?.maximumInstanceCount ?? 100;

    // Plan SKU
    const planSkuBicep = inferPlanSkuBicep(site);

    // Determine if consumption or premium for content share settings
    const isConsumption = planSkuBicep.includes("'Dynamic'");
    const isPremium = planSkuBicep.includes("'ElasticPremium'");

    const bicepContent = `// Auto-generated Bicep template from existing Function App "${siteName}"
// Generated by Azure Functions VS Code extension (deploy with AZD)
// This template mirrors the current infrastructure configuration.
// Review and adjust the App Service Plan SKU if it does not match your actual plan.

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
param useManagedIdentity bool = ${hasManagedIdentity}

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

${hasManagedIdentity ? `// ========== User-Assigned Managed Identity ==========
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${identityName}'
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
` : ''}// ========== Log Analytics Workspace ==========
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
  sku: ${planSkuBicep}
  kind: '${isLinux ? 'linux' : 'app'}'
  properties: {
    reserved: ${isLinux}
  }
}

// ========== Function App ==========
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: '${siteKind}'${hasManagedIdentity ? `
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
          authentication: ${hasManagedIdentity ? `{
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
      appSettings: [${hasManagedIdentity ? `
        { name: 'AzureWebJobsStorage__blobServiceUri', value: 'https://\${storageAccount.name}.blob.core.windows.net' }
        { name: 'AzureWebJobsStorage__queueServiceUri', value: 'https://\${storageAccount.name}.queue.core.windows.net' }
        { name: 'AzureWebJobsStorage__tableServiceUri', value: 'https://\${storageAccount.name}.table.core.windows.net' }` : `
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=\${storageAccount.name};AccountKey=\${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }`}
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~${functionsVersion}' }${!isFlex ? `
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: '${workerRuntime}' }` : ''}
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }${(isConsumption || isPremium) && !hasManagedIdentity ? `
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING', value: 'DefaultEndpointsProtocol=https;AccountName=\${storageAccount.name};AccountKey=\${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
        { name: 'WEBSITE_CONTENTSHARE', value: toLower(functionAppName) }` : ''}${!isLinux && !isFlex ? `
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }` : ''}${isFlex && !hasManagedIdentity ? `
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
output appInsightsConnectionString string = appInsights.properties.ConnectionString${hasManagedIdentity ? `
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityId string = managedIdentity.id` : ''}
`;

    const parametersContent = JSON.stringify({
        '$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
        contentVersion: '1.0.0.0',
        parameters: {
            functionAppName: { value: siteName },
            storageAccountName: { value: storageAccountName },
            appServicePlanName: { value: planName },
            appInsightsName: { value: appInsightsName },
            location: { value: '${AZURE_LOCATION}' },
            useManagedIdentity: { value: hasManagedIdentity },
        }
    }, null, 2);

    return { bicepContent, parametersContent };
}
