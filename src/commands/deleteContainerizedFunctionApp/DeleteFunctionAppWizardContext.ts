/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site } from "@azure/arm-appservice";
import { type ExecuteActivityContext, type IActionContext, type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";

export interface DeleteFunctionappWizardContext extends ISubscriptionActionContext, IActionContext, ExecuteActivityContext {
    site: Site;
}
