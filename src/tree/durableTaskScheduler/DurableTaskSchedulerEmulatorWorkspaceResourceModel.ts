import { TreeItem, TreeItemCollapsibleState, type ProviderResult } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";
import { type DurableTaskSchedulerEmulator } from "./DurableTaskSchedulerEmulatorClient";
import { treeUtils } from "../../utils/treeUtils";
import { DurableTaskSchedulerTaskHubWorkspaceResourceModel } from "./DurableTaskSchedulerTaskHubWorkspaceResourceModel";

export class DurableTaskSchedulerEmulatorWorkspaceResourceModel implements DurableTaskSchedulerWorkspaceResourceModel {
    constructor(private readonly emulator: DurableTaskSchedulerEmulator) {
    }

    getChildren(): ProviderResult<DurableTaskSchedulerWorkspaceResourceModel[]> {
        return [
            new DurableTaskSchedulerTaskHubWorkspaceResourceModel(
                'default',
                this.emulator.dashboardEndpoint)
        ]
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        const treeItem = new TreeItem(this.emulator.name, TreeItemCollapsibleState.Expanded);

        treeItem.contextValue = 'azFunc.dts.emulatorInstance';
        treeItem.iconPath = treeUtils.getIconPath('durableTaskScheduler/DurableTaskScheduler');
        treeItem.id = this.emulator.id;

        return treeItem;
    }

    get id(): string { return this.emulator.id; }
}
