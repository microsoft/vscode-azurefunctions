/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceGroup } from "@azure/arm-resources";
import { type IActionContext, type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";
import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { type ConnectionType } from "../../../../constants";
import { type DurableTaskHubResource, type DurableTaskSchedulerResource } from "../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type StorageConnectionType } from "../IConnectionTypesContext";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IDTSConnectionWizardContext extends IActionContext, ISetConnectionSettingContext {
    // Connection Types
    azureWebJobsStorageType?: StorageConnectionType;
    dtsConnectionType?: ConnectionType;

    newDTSConnectionSetting?: string;
    newDTSHubNameConnectionSetting?: string;
}

export interface IDTSAzureConnectionWizardContext extends ISubscriptionActionContext, IDTSConnectionWizardContext {
    subscription?: AzureSubscription;
    resourceGroup?: ResourceGroup;

    suggestedDTSEndpointLocalSettings?: string;
    suggestedDTSHubNameLocalSettings?: string;

    newDTSName?: string;
    dts?: DurableTaskSchedulerResource;

    newDTSHubName?: string;
    dtsHub?: DurableTaskHubResource;
}
