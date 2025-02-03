import { TreeItem, TreeItemCollapsibleState, type ProviderResult } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";
import { localize } from "../../localize";
import { treeUtils } from "../../utils/treeUtils";

export class DurableTaskSchedulerEmulatorsWorkspaceResourceModel implements DurableTaskSchedulerWorkspaceResourceModel {
    getChildren(): ProviderResult<DurableTaskSchedulerWorkspaceResourceModel[]> {
        return [];
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        const treeItem = new TreeItem(localize('dtsEmulatorsLabel', 'Durable Task Scheduler Emulators'), TreeItemCollapsibleState.Collapsed);

        treeItem.iconPath = treeUtils.getIconPath('durableTaskScheduler/DurableTaskScheduler');

        return treeItem;
    }

    id?: string | undefined;
}
