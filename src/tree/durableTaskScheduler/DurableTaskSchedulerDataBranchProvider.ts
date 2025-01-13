import { type ResourceModelBase, type AzureResource, type AzureResourceBranchDataProvider, type AzureResourceModel } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, TreeItem } from "vscode";

interface DurableTaskSchedulerModelBase extends ResourceModelBase {
    getChildren(_: DurableTaskSchedulerModelBase): ProviderResult<DurableTaskSchedulerModelBase[]>;

    getTreeItem(element: DurableTaskSchedulerModelBase): TreeItem | Thenable<TreeItem>;
}

export class DurableTaskSchedulerResourceModel implements DurableTaskSchedulerModelBase, AzureResourceModel {
    public constructor(private readonly resource: AzureResource) {
    }

    getChildren(): ProviderResult<DurableTaskSchedulerResourceModel[]> {
        return [];
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        return new TreeItem(this.name);
    }

    public get id(): string | undefined { return this.resource.id; }

    public get azureResourceId() { return this.resource.id; }

    public get name() { return this.resource.name; }
}

export class DurableTaskSchedulerDataBranchProvider implements AzureResourceBranchDataProvider<DurableTaskSchedulerResourceModel> {
    getChildren(element: DurableTaskSchedulerResourceModel): ProviderResult<DurableTaskSchedulerResourceModel[]> {
        return element.getChildren();
    }

    getResourceItem(element: AzureResource): DurableTaskSchedulerResourceModel | Thenable<DurableTaskSchedulerResourceModel> {
        return new DurableTaskSchedulerResourceModel(element);
    }

    getTreeItem(element: DurableTaskSchedulerResourceModel): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }
}
