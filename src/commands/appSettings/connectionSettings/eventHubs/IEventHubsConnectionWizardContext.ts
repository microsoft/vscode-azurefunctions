/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { EHNamespace } from "@azure/arm-eventhub";
import type { ResourceManagementModels } from "@azure/arm-resources";
import { ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { EventHubsConnectionTypeValues, StorageConnectionTypeValues } from "../../../../constants";
import { ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IEventHubsConnectionWizardContext extends ISetConnectionSettingContext, Partial<ISubscriptionContext> {
    resourceGroup?: ResourceManagementModels.ResourceGroup;

    // Connection Types
    azureWebJobsStorageType?: StorageConnectionTypeValues;
    eventHubsConnectionType?: EventHubsConnectionTypeValues;

    // Netherite
    newEventHubsNamespaceName?: string;
    eventHubsNamespace?: EHNamespace;
    newEventHubName?: string;
}
