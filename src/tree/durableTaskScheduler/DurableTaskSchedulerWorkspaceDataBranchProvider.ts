import { type WorkspaceResource, type WorkspaceResourceBranchDataProvider } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, type Event, type TreeItem } from "vscode";
import { type DurableTaskSchedulerWorkspaceResourceModel } from "./DurableTaskSchedulerWorkspaceResourceModel";
import { DurableTaskSchedulerEmulatorsWorkspaceResourceModel } from "./DurableTaskSchedulerEmulatorsWorkspaceResourceModel";
import { type DurableTaskSchedulerEmulatorClient } from "./DurableTaskSchedulerEmulatorClient";

export class DurableTaskSchedulerWorkspaceDataBranchProvider implements WorkspaceResourceBranchDataProvider<DurableTaskSchedulerWorkspaceResourceModel> {
    constructor(private readonly emulatorClient: DurableTaskSchedulerEmulatorClient) {
    }

    getChildren(element: DurableTaskSchedulerWorkspaceResourceModel): ProviderResult<DurableTaskSchedulerWorkspaceResourceModel[]> {
        return element.getChildren();
    }

    getResourceItem(_: WorkspaceResource): DurableTaskSchedulerWorkspaceResourceModel | Thenable<DurableTaskSchedulerWorkspaceResourceModel> {
        return new DurableTaskSchedulerEmulatorsWorkspaceResourceModel(this.emulatorClient);
    }

    onDidChangeTreeData?: Event<void | DurableTaskSchedulerWorkspaceResourceModel | DurableTaskSchedulerWorkspaceResourceModel[] | null | undefined> | undefined;

    getTreeItem(element: DurableTaskSchedulerWorkspaceResourceModel): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }
}
