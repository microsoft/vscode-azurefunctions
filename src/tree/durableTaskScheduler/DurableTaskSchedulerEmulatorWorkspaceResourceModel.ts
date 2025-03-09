/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeItem, TreeItemCollapsibleState, type Uri, type ProviderResult } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";
import { type DurableTaskSchedulerEmulator } from "./DurableTaskSchedulerEmulatorClient";
import { treeUtils } from "../../utils/treeUtils";
import { DurableTaskSchedulerTaskHubWorkspaceResourceModel } from "./DurableTaskSchedulerTaskHubWorkspaceResourceModel";
import { type DurableTaskSchedulerEndpointModel } from "./DurableTaskSchedulerEndpointModel";

export class DurableTaskSchedulerEmulatorWorkspaceResourceModel implements DurableTaskSchedulerWorkspaceResourceModel, DurableTaskSchedulerEndpointModel {
    constructor(private readonly emulator: DurableTaskSchedulerEmulator) {
    }

    getChildren(): ProviderResult<DurableTaskSchedulerWorkspaceResourceModel[]> {
        return this.emulator.taskHubs.map(
            taskHub =>
                new DurableTaskSchedulerTaskHubWorkspaceResourceModel(
                    taskHub,
                    this.emulator.dashboardEndpoint));
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        const treeItem = new TreeItem(this.emulator.name, TreeItemCollapsibleState.Expanded);

        treeItem.contextValue = 'azFunc.dts.emulatorInstance azFunc.dts.schedulerEndpoint';
        treeItem.iconPath = treeUtils.getIconPath('durableTaskScheduler/DurableTaskScheduler');
        treeItem.id = this.emulator.id;

        return treeItem;
    }

    get endpointUrl(): Uri { return this.emulator.schedulerEndpoint; }

    get id(): string { return this.emulator.id; }

    get taskHubs(): string[] { return this.emulator.taskHubs; }
}
