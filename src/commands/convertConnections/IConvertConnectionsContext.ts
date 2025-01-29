/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type Connection } from "./SelectConnectionsStep";

export interface IConvertConnectionsContext extends IActionContext {
    connections?: Connection[];
    modifyRoles?: Connection[];
    managedIdentityResourceId?: string;
}
