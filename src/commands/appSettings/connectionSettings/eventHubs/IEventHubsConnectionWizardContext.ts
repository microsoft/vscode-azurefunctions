/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ResourceGroup } from "@azure/arm-resources";
import { EventHubsConnectionTypeValues, StorageConnectionTypeValues } from "../../../../constants";
import { IEventHubWizardContext } from "../../../addBinding/settingSteps/eventHub/IEventHubWizardContext";
import { ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IEventHubsConnectionWizardContext extends IEventHubWizardContext, ISetConnectionSettingContext {
    resourceGroup?: ResourceGroup;

    // Connection Types
    azureWebJobsStorageType?: StorageConnectionTypeValues;
    eventHubsConnectionType?: EventHubsConnectionTypeValues;

    // Netherite uses all of the eventhub namespace settings in IEventHubWizardContext
}``
