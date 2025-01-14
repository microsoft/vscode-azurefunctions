/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureResourceModel } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, type TreeItem } from "vscode";

export interface DurableTaskSchedulerModel extends AzureResourceModel {
    getChildren(): ProviderResult<DurableTaskSchedulerModel[]>;

    getTreeItem(): TreeItem | Thenable<TreeItem>;
}
