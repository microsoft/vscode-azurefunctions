/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ExecuteActivityContext, IActionContext } from "@microsoft/vscode-azext-utils";
import { ISubscriptionContext } from "vscode-azureextensiondev";
import { SlotTreeItem } from "../../tree/SlotTreeItem";

export interface IDeleteWizardContext extends IActionContext, ExecuteActivityContext {
    node?: SlotTreeItem;
    resourceGroupToDelete?: string;
    subscription: ISubscriptionContext;
}
