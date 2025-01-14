import { type AzureResource, type AzureResourceModel } from "@microsoft/vscode-azureresources-api";
import { type DurableTaskSchedulerModel } from "./DurableTaskSchedulerModel";
import { type DurableTaskSchedulerClient } from "./DurableTaskSchedulerClient";
import { DurableTaskHubResourceModel } from "./DurableTaskHubResourceModel";
import { TreeItem, TreeItemCollapsibleState } from "vscode";

export class DurableTaskSchedulerResourceModel implements DurableTaskSchedulerModel, AzureResourceModel {
    public constructor(private readonly resource: AzureResource, private readonly schedulerClient: DurableTaskSchedulerClient) {
    }

    async getChildren(): Promise<DurableTaskHubResourceModel[]> {
        if (!this.resource.resourceGroup) {
            return [];
        }

        const taskHubs = await this.schedulerClient.getSchedulerTaskHubs(this.resource.subscription, this.resource.resourceGroup, this.resource.name);

        return taskHubs.map(resource => new DurableTaskHubResourceModel(this.resource, resource, this.schedulerClient));
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        return new TreeItem(this.name, TreeItemCollapsibleState.Collapsed);
    }

    public get id(): string | undefined { return this.resource.id; }

    public get azureResourceId() { return this.resource.id; }

    public get name() { return this.resource.name; }
}
