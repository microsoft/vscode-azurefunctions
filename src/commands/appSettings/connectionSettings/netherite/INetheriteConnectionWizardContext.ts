/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AuthorizationRule, type EHNamespace, type Eventhub } from "@azure/arm-eventhub";
import { type IResourceGroupWizardContext } from "@microsoft/vscode-azext-azureutils";
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

// Todo: We should create more generalized event hub creation steps with context
// https://github.com/microsoft/vscode-azurefunctions/pull/4680#discussion_r2286177513
interface IEventHubWizardContext extends IResourceGroupWizardContext {
    newEventHubsNamespaceName?: string;
    eventHubsNamespace?: EHNamespace;

    newAuthRuleName?: string;
    authRule?: AuthorizationRule;

    newEventHubName?: string;
    eventHub?: Eventhub;
}
