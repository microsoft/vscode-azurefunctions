import { type WorkspaceResourceModel } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, type TreeItem } from "vscode";

export interface DurableTaskSchedulerWorkspaceResourceModel extends WorkspaceResourceModel {
    getChildren(): ProviderResult<DurableTaskSchedulerWorkspaceResourceModel[]>;

    getTreeItem(): TreeItem | Thenable<TreeItem>;
}
