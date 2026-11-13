/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type ConnectorJsonValue =
    | boolean
    | number
    | string
    | null
    | ConnectorJsonValue[]
    | { [key: string]: ConnectorJsonValue };

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

export type ConnectorChildProvisioningState =
    | 'Succeeded'
    | 'Failed'
    | 'Canceled'
    | 'InProgress';

export type ConnectorConnectionOverallStatus =
    | 'Connected'
    | 'Unauthenticated'
    | 'Error';

export interface ConnectorConnectionStatusDetail {
    readonly status?: string;
}

export interface ConnectorConnectionProperties {
    readonly provisioningState?: ConnectorChildProvisioningState;
    readonly displayName?: string;
    readonly connectorName?: string;
    readonly connectionRuntimeUrl?: string;
    readonly overallStatus?: ConnectorConnectionOverallStatus;
    readonly statuses?: readonly ConnectorConnectionStatusDetail[];
    readonly createdBy?: {
        readonly objectId?: string;
        readonly tenantId?: string;
    };
}

export interface ConnectorConnectionResource extends ConnectorResourceEnvelope {
    readonly properties?: ConnectorConnectionProperties;
}

export interface ConnectorConnectionCreateOrUpdateRequest {
    readonly location?: string;
    readonly tags?: Readonly<Record<string, string>>;
    readonly identity?: ConnectorManagedIdentity;
    readonly managedBy?: string;
    readonly properties: {
        readonly connectorName: string;
        readonly displayName?: string;
    };
}

export interface ConnectorConnectionStatus {
    readonly status?: string;
    readonly overallStatus?: ConnectorConnectionOverallStatus;
    readonly provisioningState?: ConnectorChildProvisioningState;
    readonly statuses?: readonly ConnectorConnectionStatusDetail[];
}

export interface ConnectorConnectionAccessPolicyPrincipal {
    readonly type?: 'NotSpecified' | 'ActiveDirectory';
    readonly identity?: {
        readonly objectId?: string;
        readonly tenantId?: string;
    };
}

export interface ConnectorConnectionAccessPolicyProperties {
    readonly provisioningState?: ConnectorChildProvisioningState;
    readonly principal?: ConnectorConnectionAccessPolicyPrincipal;
}

export interface ConnectorConnectionAccessPolicyResource extends ConnectorResourceEnvelope {
    readonly properties?: ConnectorConnectionAccessPolicyProperties;
}

export interface ConnectorConnectionAccessPolicyCreateOrUpdateRequest {
    readonly location?: string;
    readonly tags?: Readonly<Record<string, string>>;
    readonly identity?: ConnectorManagedIdentity;
    readonly managedBy?: string;
    readonly properties: {
        readonly principal: {
            readonly type: 'ActiveDirectory';
            readonly identity: {
                readonly objectId: string;
                readonly tenantId: string;
            };
        };
    };
}

export interface ConnectorConsentParameter {
    readonly objectId?: string;
    readonly parameterName?: string;
    readonly redirectUrl?: string;
    readonly tenantId?: string;
}

export interface ConnectorListConsentLinksRequest {
    readonly parameters?: readonly ConnectorConsentParameter[];
}

export interface ConnectorConsentLink {
    readonly link?: string;
    readonly firstPartyLoginUri?: string;
    readonly displayName?: string;
    readonly status?: string;
}

export interface ConnectorConfirmConsentCodeRequest {
    readonly code?: string;
    readonly objectId?: string;
    readonly tenantId?: string;
}

export interface ConnectorConfirmConsentCodeResponse {
    readonly status?: string;
}

export type ConnectorDynamicInvokeMethod =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS';

export interface ConnectorDynamicInvokeRequest {
    readonly request: {
        readonly method?: ConnectorDynamicInvokeMethod;
        readonly path?: string;
        readonly queries?: Readonly<Record<string, string>>;
        readonly headers?: Readonly<Record<string, string>>;
        readonly body?: ConnectorJsonValue;
    };
}

export interface ConnectorDynamicInvokeResponse {
    readonly response?: {
        readonly statusCode?: number | string;
        readonly body?: ConnectorJsonValue;
        readonly headers?: Readonly<Record<string, unknown>>;
    };
}

export interface ConnectorOperationParameter {
    readonly name?: string;
    readonly displayName?: string;
    readonly value?: ConnectorJsonValue;
    readonly displayValue?: string;
    readonly isRequired?: boolean | null;
    readonly schema?: Readonly<Record<string, unknown>>;
}

export type ConnectorTriggerConfigState = 'Enabled' | 'Disabled';
export type ConnectorTriggerDeliveryMode = 'Poll';
export type ConnectorTriggerConfigType = 'NotSpecified' | 'Recurrence' | 'SlidingWindow';
export type ConnectorTriggerFrequency =
    | 'NotSpecified'
    | 'Second'
    | 'Minute'
    | 'Hour'
    | 'Day'
    | 'Week'
    | 'Month'
    | 'Year';
export type ConnectorTriggerHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ConnectorTriggerRecurrence {
    readonly frequency: ConnectorTriggerFrequency;
    readonly interval: number;
    readonly timeZone?: string;
    readonly startTime?: string;
    readonly schedule?: Readonly<Record<string, unknown>>;
}

export interface ConnectorTriggerCondition {
    readonly expression: string;
}

export interface ConnectorTriggerConfigSettings {
    readonly disableSplitOn?: boolean | null;
}

export interface ConnectorTriggerConfigProperties {
    readonly provisioningState?: ConnectorChildProvisioningState;
    readonly state?: ConnectorTriggerConfigState;
    readonly deliveryMode?: ConnectorTriggerDeliveryMode;
    readonly description?: string;
    readonly connectionDetails?: {
        readonly connectorName?: string;
        readonly connectionName?: string;
    };
    readonly operationName?: string;
    readonly parameters?: readonly ConnectorOperationParameter[];
    readonly notificationDetails?: {
        readonly callbackUrl?: string;
        readonly httpMethod?: ConnectorTriggerHttpMethod;
        readonly authentication?: Readonly<Record<string, unknown>>;
        readonly body?: Readonly<Record<string, unknown>>;
    };
    readonly type?: ConnectorTriggerConfigType;
    readonly recurrence?: ConnectorTriggerRecurrence;
    readonly delay?: string;
    readonly conditions?: readonly ConnectorTriggerCondition[];
    readonly settings?: ConnectorTriggerConfigSettings;
    readonly metadata?: ConnectorJsonValue;
    readonly pollingEndpoints?: {
        readonly receiveUri?: string;
        readonly acknowledgeUri?: string;
        readonly hasMessagesUri?: string;
        readonly approximateQueueDepthUri?: string;
    };
}

export interface ConnectorTriggerConfigResource extends ConnectorResourceEnvelope {
    readonly properties?: ConnectorTriggerConfigProperties;
}

export interface ConnectorTriggerConfigCreateOrUpdateRequest {
    readonly location?: string;
    readonly tags?: Readonly<Record<string, string>>;
    readonly identity?: ConnectorManagedIdentity;
    readonly managedBy?: string;
    readonly properties?: Omit<ConnectorTriggerConfigProperties, 'pollingEndpoints' | 'provisioningState'>;
}
