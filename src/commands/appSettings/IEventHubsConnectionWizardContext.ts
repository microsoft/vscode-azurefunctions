/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { EHNamespace } from "@azure/arm-eventhub";
import type { ResourceGroup } from "@azure/arm-resources/esm/models";
import { IActionContext, ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { ConnectionTypeValues } from "../../constants";

export interface IEventHubsConnectionWizardContext extends IActionContext, Partial<ISubscriptionContext> {
    projectPath: string;

    resourceGroup?: ResourceGroup;

    // Connection Types
    azureWebJobsStorageType?: ConnectionTypeValues;
    eventHubConnectionType?: ConnectionTypeValues;

    // Netherite
    newEventHubsNamespaceName?: string;
    eventHubsNamespace?: EHNamespace;
    newEventHubName?: string;

    eventHubRemoteConnection?: string;
}
