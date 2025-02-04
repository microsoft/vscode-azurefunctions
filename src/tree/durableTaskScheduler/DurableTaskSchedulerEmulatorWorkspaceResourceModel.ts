import { TreeItem, type ProviderResult } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";
import { type DurableTaskSchedulerEmulator } from "./DurableTaskSchedulerEmulatorClient";
import { treeUtils } from "../../utils/treeUtils";

export class DurableTaskSchedulerEmulatorWorkspaceResourceModel implements DurableTaskSchedulerWorkspaceResourceModel {
    constructor(private readonly emulator: DurableTaskSchedulerEmulator) {
    }

    getChildren(): ProviderResult<DurableTaskSchedulerWorkspaceResourceModel[]> {
        throw new Error("Method not implemented.");
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        const treeItem = new TreeItem(this.emulator.name);

        treeItem.contextValue = 'azFunc.dts.emulatorInstance';
        treeItem.iconPath = treeUtils.getIconPath('durableTaskScheduler/DurableTaskScheduler');
        treeItem.id = this.emulator.id;

        return treeItem;
    }

    get id(): string { return this.emulator.id; }
}
