/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ConnectionType } from "../../../constants";

export type StorageConnectionType = ConnectionType.Azure | ConnectionType.Emulator;
export type DTSConnectionType = ConnectionType;
export type EventHubsConnectionType = ConnectionType.Azure | ConnectionType.Emulator;
export type SqlDbConnectionType = ConnectionType.Azure | ConnectionType.Custom;

export interface IConnectionTypesContext {
    azureWebJobsStorageType?: StorageConnectionType;
    dtsConnectionType?: DTSConnectionType;
    eventHubsConnectionType?: EventHubsConnectionType;
    sqlDbConnectionType?: SqlDbConnectionType;
}

