/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ResourceGroup } from "@azure/arm-resources";
import { type IEventHubWizardContext } from "../../../addBinding/settingSteps/eventHub/IEventHubWizardContext";
import { type EventHubsConnectionType, type StorageConnectionType } from "../IConnectionTypesContext";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IEventHubsConnectionWizardContext extends IEventHubWizardContext, ISetConnectionSettingContext {
    resourceGroup?: ResourceGroup;

    // Connection Types
    azureWebJobsStorageType?: StorageConnectionType;
    eventHubsConnectionType?: EventHubsConnectionType;

    // Netherite uses all of the eventhub namespace settings in IEventHubWizardContext
}
