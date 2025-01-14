import { type AzureSubscription, type AzureResource, type AzureResourceBranchDataProvider, type AzureResourceModel } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { treeUtils } from "../../utils/treeUtils";
import { type DurableTaskHubResource, type DurableTaskSchedulerClient } from "./DurableTaskSchedulerClient";

interface DurableTaskSchedulerModelBase extends AzureResourceModel {
    getChildren(): ProviderResult<DurableTaskSchedulerModelBase[]>;

    getTreeItem(): TreeItem | Thenable<TreeItem>;
}

export class DurableTaskHubResourceModel implements DurableTaskSchedulerModelBase {
    constructor(private readonly subscription: AzureSubscription, private readonly resource: DurableTaskHubResource) {
    }

    public get azureResourceId() { return this.resource.id; }

    get dashboardUrl(): Uri { return Uri.parse(this.resource.properties.dashboardUrl); }

    get id(): string { return this.resource.id; }

    get portalUrl(): Uri {
        const queryPrefix = '';
        const url: string = `${this.subscription.environment.portalUrl}/${queryPrefix}#@${this.subscription.tenantId}/resource${this.id}`;

        return Uri.parse(url);
    }

    getChildren(): ProviderResult<DurableTaskSchedulerModelBase[]>
    {
        return [];
    }

    getTreeItem(): TreeItem | Thenable<TreeItem>
    {
        const treeItem = new TreeItem(this.resource.name)

        treeItem.iconPath = treeUtils.getIconPath('durableTaskScheduler/DurableTaskScheduler');
        treeItem.contextValue = 'azFunc.dts.taskHub';

        return treeItem;
    }
}

export class DurableTaskSchedulerResourceModel implements DurableTaskSchedulerModelBase, AzureResourceModel {
    public constructor(private readonly resource: AzureResource, private readonly schedulerClient: DurableTaskSchedulerClient) {
    }

    async getChildren(): Promise<DurableTaskHubResourceModel[]> {
        if (!this.resource.resourceGroup) {
            return [];
        }

        const taskHubs = await this.schedulerClient.getSchedulerTaskHubs(this.resource.subscription, this.resource.resourceGroup, this.resource.name);

        return taskHubs.map(resource => new DurableTaskHubResourceModel(this.resource.subscription, resource));
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        return new TreeItem(this.name, TreeItemCollapsibleState.Collapsed);
    }

    public get id(): string | undefined { return this.resource.id; }

    public get azureResourceId() { return this.resource.id; }

    public get name() { return this.resource.name; }
}

export class DurableTaskSchedulerDataBranchProvider implements AzureResourceBranchDataProvider<DurableTaskSchedulerModelBase> {
    constructor(private readonly schedulerClient: DurableTaskSchedulerClient) {
    }

    getChildren(element: DurableTaskSchedulerModelBase): ProviderResult<DurableTaskSchedulerModelBase[]> {
        return element.getChildren();
    }

    getResourceItem(element: AzureResource): DurableTaskSchedulerResourceModel | Thenable<DurableTaskSchedulerResourceModel> {
        return new DurableTaskSchedulerResourceModel(element, this.schedulerClient);
    }

    getTreeItem(element: DurableTaskSchedulerModelBase): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }
}
