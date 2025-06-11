/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceGroup } from "@azure/arm-resources";
import { type ConnectionType, type StorageConnectionType } from "../../../../constants";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IDTSConnectionWizardContext extends ISetConnectionSettingContext {
    resourceGroup?: ResourceGroup;

    // Connection Types
    azureWebJobsStorageType?: StorageConnectionType;
    dtsConnectionType?: ConnectionType;

    newDTSConnection?: string;
    newDTSHubName?: string;
}
