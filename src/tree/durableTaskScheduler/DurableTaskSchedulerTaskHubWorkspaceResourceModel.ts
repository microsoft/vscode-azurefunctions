/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeItem, Uri } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";
import { treeUtils } from "../../utils/treeUtils";
import { type DurableTaskSchedulerDashboardModel } from "./DurableTaskSchedulerDashboardModel";

export class DurableTaskSchedulerTaskHubWorkspaceResourceModel implements DurableTaskSchedulerWorkspaceResourceModel, DurableTaskSchedulerDashboardModel {
    constructor(
        private readonly name: string,
        private readonly dashboardEndpoint: Uri) {
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        const treeItem = new TreeItem(this.name);

        treeItem.contextValue = 'azFunc.dts.emulatorTaskHub;azFunc.dts.taskHubDashboard';
        treeItem.iconPath = treeUtils.getIconPath('durableTaskScheduler/DurableTaskScheduler');

        return treeItem;
    }

    get dashboardUrl(): Uri { return Uri.joinPath(this.dashboardEndpoint, 'subscriptions/default/schedulers/default/taskhubs', this.name); }

    id?: string | undefined;
}
