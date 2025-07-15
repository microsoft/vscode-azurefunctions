/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EventHubsConnectionType, type SqlDbConnectionType, type StorageConnectionType } from "./IConnectionTypesContext";


export interface IConnectionPromptOptions {
    preselectedConnectionType?: StorageConnectionType | EventHubsConnectionType | SqlDbConnectionType;
}

