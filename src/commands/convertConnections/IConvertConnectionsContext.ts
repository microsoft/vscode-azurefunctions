/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type IResourceGroupWizardContext, type Role } from "@microsoft/vscode-azext-azureutils";
import { type ExecuteActivityContext, type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";
import { type SlotTreeItem } from "../../tree/SlotTreeItem";
import { type Connection } from "./SelectConnectionsStep";

export interface IConvertConnectionsContext extends ExecuteActivityContext, IResourceGroupWizardContext, ISubscriptionActionContext {
    local: boolean;
    functionapp?: SlotTreeItem;
    connections?: Connection[];
    convertedConnections?: Connection[];
    roles?: Role[];
    localSettingsPath?: string;
}
