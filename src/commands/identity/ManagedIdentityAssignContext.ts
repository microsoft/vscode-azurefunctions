/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { type IResourceGroupWizardContext } from "@microsoft/vscode-azext-azureutils";
import { type ExecuteActivityContext } from "@microsoft/vscode-azext-utils";

export interface ManagedIdentityAssignContext extends IResourceGroupWizardContext, ExecuteActivityContext {
    site?: ParsedSite;
}
