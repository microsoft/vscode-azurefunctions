/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ExecuteActivityContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { type ConnectionType } from "../../../../constants";
import { type DurableTaskHubResource, type DurableTaskSchedulerResource } from "../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient";
import { type IFunctionAppUserAssignedIdentitiesContext } from "../../../identity/listUserAssignedIdentities/IFunctionAppUserAssignedIdentitiesContext";
import { type StorageConnectionType } from "../IConnectionTypesContext";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IDTSConnectionWizardContext extends IActionContext, ISetConnectionSettingContext {
    azureWebJobsStorageType?: StorageConnectionType;
    dtsConnectionType?: ConnectionType;

    suggestedDTSEndpointLocalSettings?: string;
    suggestedDTSHubNameLocalSettings?: string;

    // All properties from `IDTSConnectionSetSettingsContext` apply
}

export interface IDTSAzureConnectionWizardContext extends IFunctionAppUserAssignedIdentitiesContext, IDTSConnectionWizardContext, Partial<ExecuteActivityContext> {
    subscription?: AzureSubscription;

    newDTSName?: string;
    dts?: DurableTaskSchedulerResource;

    newDTSHubName?: string;
    dtsHub?: DurableTaskHubResource;
}
