import { type AzureResource, type AzureResourceBranchDataProvider, type AzureResourceModel } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, TreeItem } from "vscode";

export class DurableTaskSchedulerResourceModel implements AzureResourceModel {
    public constructor(private readonly resource: AzureResource) {
    }

    public get azureResourceId() { return this.resource.id; }

    public get name() { return this.resource.name; }
}

export class DurableTaskSchedulerDataBranchProvider implements AzureResourceBranchDataProvider<DurableTaskSchedulerResourceModel> {
    getChildren(_: DurableTaskSchedulerResourceModel): ProviderResult<DurableTaskSchedulerResourceModel[]> {
        return [];
    }

    getResourceItem(element: AzureResource): DurableTaskSchedulerResourceModel | Thenable<DurableTaskSchedulerResourceModel> {
        return new DurableTaskSchedulerResourceModel(element);
    }

    getTreeItem(element: DurableTaskSchedulerResourceModel): TreeItem | Thenable<TreeItem> {
        return new TreeItem(element.name);
    }
}
