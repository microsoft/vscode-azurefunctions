/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";
import { localize } from "../../localize";
import { treeUtils } from "../../utils/treeUtils";
import {type DurableTaskSchedulerEmulatorClient } from "./DurableTaskSchedulerEmulatorClient";
import { DurableTaskSchedulerEmulatorWorkspaceResourceModel } from "./DurableTaskSchedulerEmulatorWorkspaceResourceModel";
import { DurableTaskSchedulerErrorWorkspaceResourceModel } from "./DurableTaskSchedulerErrorWorkspaceResourceModel";
import { parseError } from "@microsoft/vscode-azext-utils";

export class DurableTaskSchedulerEmulatorsWorkspaceResourceModel implements DurableTaskSchedulerWorkspaceResourceModel {
    constructor(private readonly emulatorClient: DurableTaskSchedulerEmulatorClient) {
    }

    async getChildren(): Promise<DurableTaskSchedulerWorkspaceResourceModel[]> {
        try {
            const emulators = await this.emulatorClient.getEmulators();

            return emulators.map(emulator => new DurableTaskSchedulerEmulatorWorkspaceResourceModel(emulator));
        }
        catch (error) {
            return [new DurableTaskSchedulerErrorWorkspaceResourceModel(parseError(error).message)];
        }
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        const treeItem = new TreeItem(localize('dtsEmulatorsLabel', 'Durable Task Scheduler Emulators'), TreeItemCollapsibleState.Collapsed);

        treeItem.contextValue = 'azFunc.dts.emulators';
        treeItem.iconPath = treeUtils.getIconPath('durableTaskScheduler/DurableTaskScheduler');

        return treeItem;
    }

    id?: string | undefined;
}
