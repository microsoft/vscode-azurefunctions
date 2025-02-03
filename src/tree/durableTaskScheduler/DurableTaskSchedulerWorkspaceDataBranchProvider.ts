import { type WorkspaceResource, type WorkspaceResourceBranchDataProvider } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, type Event, type TreeItem } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";
import { DurableTaskSchedulerEmulatorsWorkspaceResourceModel } from "./DurableTaskSchedulerEmulatorsWorkspaceResourceModel";

export class DurableTaskSchedulerWorkspaceDataBranchProvider implements WorkspaceResourceBranchDataProvider<DurableTaskSchedulerWorkspaceResourceModel> {
    getChildren(element: DurableTaskSchedulerWorkspaceResourceModel): ProviderResult<DurableTaskSchedulerWorkspaceResourceModel[]> {
        return element.getChildren();
    }

    getResourceItem(_: WorkspaceResource): DurableTaskSchedulerWorkspaceResourceModel | Thenable<DurableTaskSchedulerWorkspaceResourceModel> {
        return new DurableTaskSchedulerEmulatorsWorkspaceResourceModel();
    }

    onDidChangeTreeData?: Event<void | DurableTaskSchedulerWorkspaceResourceModel | DurableTaskSchedulerWorkspaceResourceModel[] | null | undefined> | undefined;

    getTreeItem(element: DurableTaskSchedulerWorkspaceResourceModel): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }
}
