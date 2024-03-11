/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site } from "@azure/arm-appservice";
import { type ExecuteActivityContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ContainerTreeItem } from "../../tree/containerizedFunctionApp/ContainerTreeItem";

export interface DeleteFunctionappWizardContext extends IActionContext, ExecuteActivityContext {
    site: Site;
    proxyTree: ContainerTreeItem;
}
