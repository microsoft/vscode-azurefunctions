/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const connectorCatalogVersion = '1.0.0' as const;

export type ConnectorCatalogDelivery = 'notification' | 'polling' | 'webhook';

export type ConnectorCatalogMetadataState = 'catalogOnly' | 'complete' | 'partial';

export type ConnectorCatalogInputType =
    'array' |
    'boolean' |
    'integer' |
    'number' |
    'object' |
    'string';

export interface IConnectorCatalogSource {
    kind: 'azure-managed-connectors';
    cloud: string;
    region: string;
    catalogApiVersion: string;
    operationsApiVersion: string;
    swaggerApiVersion: string;
}

export interface IConnectorCatalogManifest {
    version: typeof connectorCatalogVersion;
    generatedAt: string;
    source: IConnectorCatalogSource;
    connectors: IConnectorCatalogConnector[];
    operations: IConnectorCatalogOperation[];
}

export interface IConnectorCatalogConnector {
    id: string;
    name: string;
    description?: string;
    iconUrl?: string;
    visibility?: string;
    metadataState: ConnectorCatalogMetadataState;
}

export interface IConnectorCatalogOperation {
    id: string;
    connectorId: string;
    name: string;
    description?: string;
    visibility?: string;
    delivery: ConnectorCatalogDelivery;
    /**
     * An empty array means the source schema was captured and has no user inputs.
     * An omitted value means the source schema was unavailable.
     */
    inputs?: IConnectorCatalogInputDefinition[];
}

export interface IConnectorCatalogInputDefinition {
    name: string;
    label: string;
    description?: string;
    type: ConnectorCatalogInputType;
    format?: string;
    required: boolean;
    defaultValue?: string | number | boolean;
    options?: IConnectorCatalogInputOption[];
    dynamic: boolean;
    sensitive: boolean;
    visibility?: string;
}

export interface IConnectorCatalogInputOption {
    label: string;
    value: string;
}
