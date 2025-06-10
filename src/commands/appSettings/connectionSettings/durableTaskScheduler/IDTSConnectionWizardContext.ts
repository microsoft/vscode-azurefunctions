/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceGroup } from "@azure/arm-resources";
import { type ConnectionType, type StorageConnectionTypeValues } from "../../../../constants";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IDTSConnectionWizardContext extends ISetConnectionSettingContext {
    resourceGroup?: ResourceGroup;

    // Connection Types
    azureWebJobsStorageType?: StorageConnectionTypeValues;
    dtsConnectionType?: ConnectionType;

    newDTSConnection?: string;
    newDTSHubName?: string;
}
