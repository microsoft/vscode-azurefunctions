/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type ConnectorGatewayProvisioningState =
    | 'Succeeded'
    | 'Failed'
    | 'Canceled'
    | 'InProgress'
    | 'Creating'
    | 'Deleting';

export interface ConnectorGatewayProperties {
    readonly provisioningState?: ConnectorGatewayProvisioningState;
    readonly aiGatewayId?: string;
    readonly connectorGatewayId?: string;
}

export interface ConnectorGatewayCreateProperties {
    readonly apiHubEnvironmentId?: string;
}

export interface ConnectorGatewayResource extends ConnectorResourceEnvelope {
    readonly properties?: ConnectorGatewayProperties;
}

export interface ConnectorGatewayCreateRequest {
    readonly location: string;
    readonly tags?: Readonly<Record<string, string>>;
    readonly identity?: ConnectorManagedIdentity;
    readonly managedBy?: string;
    readonly properties?: ConnectorGatewayCreateProperties;
}

export interface ConnectorResourceSystemData {
    readonly createdBy?: string;
    readonly createdByType?: 'User' | 'Application' | 'ManagedIdentity' | 'Key';
    readonly createdAt?: string;
    readonly lastModifiedBy?: string;
    readonly lastModifiedByType?: 'User' | 'Application' | 'ManagedIdentity' | 'Key';
    readonly lastModifiedAt?: string;
}

export interface ConnectorManagedIdentity {
    readonly type?: 'None' | 'SystemAssigned' | 'UserAssigned' | 'SystemAssigned, UserAssigned';
    readonly principalId?: string;
    readonly tenantId?: string;
    readonly userAssignedIdentities?: Readonly<Record<string, {
        readonly principalId?: string;
        readonly clientId?: string;
    }>>;
}

export interface ConnectorResourceEnvelope {
    readonly id?: string;
    readonly name?: string;
    readonly type?: string;
    readonly location?: string;
    readonly tags?: Readonly<Record<string, string>>;
    readonly identity?: ConnectorManagedIdentity;
    readonly managedBy?: string;
    readonly etag?: string;
    readonly systemData?: ConnectorResourceSystemData;
}
