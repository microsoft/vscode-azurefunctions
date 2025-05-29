/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type WorkspaceResourceModel } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, type TreeItem } from "vscode";

export interface DurableTaskSchedulerWorkspaceResourceModel extends WorkspaceResourceModel {
    getChildren?(): ProviderResult<DurableTaskSchedulerWorkspaceResourceModel[]>;

    getTreeItem(): TreeItem | Thenable<TreeItem>;
}
