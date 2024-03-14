/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sources here were obtained as the names of sources found on
 * the EventGrid samples in the azure-rest-api-specs repository:
 * https://github.com/Azure/azure-rest-api-specs/tree/master/specification/eventgrid/data-plane
 */

export type EventGridSource =
    | 'Microsoft.ApiManagement'
    | 'Microsoft.AppConfiguration'
    | 'Microsoft.AVS'
    | 'Microsoft.Cache'
    | 'Microsoft.Communication'
    | 'Microsoft.ContainerRegistry'
    | 'Microsoft.ContainerService'
    | 'Microsoft.DataBox'
    | 'Microsoft.Devices'
    | 'Microsoft.EventHub'
    | 'Microsoft.HealthcareApis'
    | 'Microsoft.KeyVault'
    | 'Microsoft.MachineLearningServices'
    | 'Microsoft.Maps'
    | 'Microsoft.Media'
    | 'Microsoft.PolicyInsights'
    | 'Microsoft.ResourceNotification'
    | 'Microsoft.Resources'
    | 'Microsoft.ServiceBus'
    | 'Microsoft.SignalRService'
    | 'Microsoft.Storage'
    | 'Microsoft.Web'
    | string;

export const supportedEventGridSources: EventGridSource[] = [
    'Microsoft.ApiManagement',
    'Microsoft.AppConfiguration',
    'Microsoft.AVS',
    'Microsoft.Cache',
    'Microsoft.Communication',
    'Microsoft.ContainerRegistry',
    'Microsoft.ContainerService',
    'Microsoft.DataBox',
    'Microsoft.Devices',
    'Microsoft.EventHub',
    'Microsoft.HealthcareApis',
    'Microsoft.KeyVault',
    'Microsoft.MachineLearningServices',
    'Microsoft.Maps',
    'Microsoft.Media',
    'Microsoft.PolicyInsights',
    'Microsoft.ResourceNotification',
    'Microsoft.Resources',
    'Microsoft.ServiceBus',
    'Microsoft.SignalRService',
    'Microsoft.Storage',
    'Microsoft.Web',
];

export const supportedEventGridSourceLabels: Map<EventGridSource, string> = new Map([
    ['Microsoft.Storage', 'Blob Storage'],
    ['Microsoft.EventHub', 'Event Hubs'],
    ['Microsoft.ServiceBus', 'Service Bus'],
    ['Microsoft.ContainerRegistry', 'Container Registry'],
    ['Microsoft.ApiManagement', 'API Management'],
    ['Microsoft.Resources', 'Resources'],
    ['Microsoft.HealthcareApis', 'Health Data Services'],
]);
