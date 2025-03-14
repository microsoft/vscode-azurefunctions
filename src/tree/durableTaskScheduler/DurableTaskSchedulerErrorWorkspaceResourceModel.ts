/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ProviderResult, ThemeIcon, TreeItem } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";

export class DurableTaskSchedulerErrorWorkspaceResourceModel implements DurableTaskSchedulerWorkspaceResourceModel {
    constructor(
        private readonly error: string) {
    }

    getChildren(): ProviderResult<DurableTaskSchedulerWorkspaceResourceModel[]> {
        return [];
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        const treeItem = new TreeItem(this.error);

        treeItem.contextValue = 'azFunc.dts.emulatorError';
        treeItem.iconPath = new ThemeIcon('warning')

        return treeItem;
    }
}
