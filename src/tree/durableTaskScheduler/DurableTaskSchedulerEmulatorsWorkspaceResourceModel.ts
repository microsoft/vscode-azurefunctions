/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";
import { localize } from "../../localize";
import { treeUtils } from "../../utils/treeUtils";
import {type DurableTaskSchedulerEmulator, type DurableTaskSchedulerEmulatorClient } from "./DurableTaskSchedulerEmulatorClient";
import { DurableTaskSchedulerEmulatorWorkspaceResourceModel } from "./DurableTaskSchedulerEmulatorWorkspaceResourceModel";
import { DurableTaskSchedulerErrorWorkspaceResourceModel } from "./DurableTaskSchedulerErrorWorkspaceResourceModel";
import { parseError } from "@microsoft/vscode-azext-utils";

export class DurableTaskSchedulerEmulatorsWorkspaceResourceModel implements DurableTaskSchedulerWorkspaceResourceModel {
    private getEmulatorsTask: Promise<DurableTaskSchedulerEmulator[]>;

    constructor(private readonly emulatorClient: DurableTaskSchedulerEmulatorClient) {
    }

    async getChildren(): Promise<DurableTaskSchedulerWorkspaceResourceModel[]> {
        this.getEmulatorsTask = this.emulatorClient.getEmulators();

        try {
            const emulators = await this.getEmulatorsTask

            return emulators.map(emulator => new DurableTaskSchedulerEmulatorWorkspaceResourceModel(emulator));
        }
        catch (error) {
            return [new DurableTaskSchedulerErrorWorkspaceResourceModel(parseError(error).message)];
        }
    }

    async getTreeItem(): Promise<TreeItem> {
        this.getEmulatorsTask ??= this.emulatorClient.getEmulators();

        const collapsibleState = await this.emulatorsExist()
            ? TreeItemCollapsibleState.Expanded
            : TreeItemCollapsibleState.Collapsed;

        const treeItem = new TreeItem(localize('dtsEmulatorsLabel', 'Durable Task Scheduler Emulators'), collapsibleState);

        treeItem.contextValue = 'azFunc.dts.emulators';
        treeItem.iconPath = treeUtils.getIconPath('durableTaskScheduler/DurableTaskScheduler');

        return treeItem;
    }

    id?: string | undefined;

    private async emulatorsExist(): Promise<boolean> {
        // Used any cached result that might exist...
        this.getEmulatorsTask ??= this.emulatorClient.getEmulators();

        try {
            const emulators = await this.getEmulatorsTask;

            if (emulators.length) {
                return true;
            }
        }
        catch {
            // NOTE: No-op.
        }

        return false;
    }
}
