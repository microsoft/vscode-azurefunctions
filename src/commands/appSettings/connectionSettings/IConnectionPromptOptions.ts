/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EventHubsConnectionTypeValues, type SqlDbConnectionTypeValues, type StorageConnectionTypeValues } from "../../../constants";

export interface IConnectionPromptOptions {
    preselectedConnectionType?: StorageConnectionTypeValues | EventHubsConnectionTypeValues | SqlDbConnectionTypeValues;
}

