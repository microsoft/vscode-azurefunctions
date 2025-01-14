import { type AzureResource, type AzureResourceBranchDataProvider } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, type TreeItem } from "vscode";
import { type DurableTaskSchedulerClient } from "./DurableTaskSchedulerClient";
import { type DurableTaskSchedulerModel } from "./DurableTaskSchedulerModel";
import { DurableTaskSchedulerResourceModel } from "./DurableTaskSchedulerResourceModel";

export class DurableTaskSchedulerDataBranchProvider implements AzureResourceBranchDataProvider<DurableTaskSchedulerModel> {
    constructor(private readonly schedulerClient: DurableTaskSchedulerClient) {
    }

    getChildren(element: DurableTaskSchedulerModel): ProviderResult<DurableTaskSchedulerModel[]> {
        return element.getChildren();
    }

    getResourceItem(element: AzureResource): DurableTaskSchedulerResourceModel | Thenable<DurableTaskSchedulerResourceModel> {
        return new DurableTaskSchedulerResourceModel(element, this.schedulerClient);
    }

    getTreeItem(element: DurableTaskSchedulerModel): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }
}
