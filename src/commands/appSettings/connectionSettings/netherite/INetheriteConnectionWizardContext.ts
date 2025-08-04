/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IEventHubWizardContext } from "../../../addBinding/settingSteps/eventHub/IEventHubWizardContext";
import { type EventHubsConnectionType, type StorageConnectionType } from "../IConnectionTypesContext";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface INetheriteConnectionWizardContext extends ISetConnectionSettingContext {
    azureWebJobsStorageType?: StorageConnectionType;
    eventHubsConnectionType?: EventHubsConnectionType;

    suggestedNamespaceLocalSettings?: string;
    suggestedEventHubLocalSettings?: string;

    // All properties from `IEventHubsConnectionsSetSettingsContext` apply
}

export type INetheriteAzureConnectionWizardContext = INetheriteConnectionWizardContext & IEventHubWizardContext;
