/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { type ConnectionType } from "../../../../constants";
import { type DurableTaskHubResource, type DurableTaskSchedulerResource } from "../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type IFunctionAppUserAssignedIdentitiesContext } from "../../../identity/listUserAssignedIdentities/IFunctionAppUserAssignedIdentitiesContext";
import { type StorageConnectionType } from "../IConnectionTypesContext";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IDTSConnectionWizardContext extends IActionContext, ISetConnectionSettingContext {
    // Connection Types
    azureWebJobsStorageType?: StorageConnectionType;
    dtsConnectionType?: ConnectionType;

    newDTSConnectionSetting?: string;
    newDTSHubNameConnectionSetting?: string;
}

export interface IDTSAzureConnectionWizardContext extends IFunctionAppUserAssignedIdentitiesContext, IDTSConnectionWizardContext {
    subscription?: AzureSubscription;

    /**
     * Durable Task Scheduler endpoint detected in local settings JSON
     */
    suggestedDTSEndpointLocalSettings?: string;
    /**
     * Durable Task Scheduler hub name detected in local settings JSON
     */
    suggestedDTSHubNameLocalSettings?: string;

    newDTSName?: string;
    dts?: DurableTaskSchedulerResource;

    newDTSHubName?: string;
    dtsHub?: DurableTaskHubResource;
}
