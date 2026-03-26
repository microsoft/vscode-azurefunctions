/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ConnectionType } from "../../../constants";

export type StorageConnectionType = ConnectionType;
export type DTSConnectionType = ConnectionType;
export type EventHubsConnectionType = ConnectionType;
export type SqlDbConnectionType = ConnectionType;

export interface IConnectionTypesContext {
    azureWebJobsStorageType?: StorageConnectionType;
    dtsConnectionType?: DTSConnectionType;
    eventHubsConnectionType?: EventHubsConnectionType;
    sqlDbConnectionType?: SqlDbConnectionType;
}

