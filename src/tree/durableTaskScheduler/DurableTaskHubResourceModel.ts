import { type AzureResource, type ViewPropertiesModel } from "@microsoft/vscode-azureresources-api";
import { type DurableTaskSchedulerModel } from "./DurableTaskSchedulerModel";
import { type DurableTaskHubResource, type DurableTaskSchedulerClient } from "./DurableTaskSchedulerClient";
import { type ProviderResult, TreeItem, Uri } from "vscode";
import { treeUtils } from "../../utils/treeUtils";

export class DurableTaskHubResourceModel implements DurableTaskSchedulerModel {
    constructor(
        private readonly schedulerResource: AzureResource,
        private readonly resource: DurableTaskHubResource,
        private readonly schedulerClient: DurableTaskSchedulerClient) {
    }

    public get azureResourceId() { return this.resource.id; }

    get dashboardUrl(): Uri { return Uri.parse(this.resource.properties.dashboardUrl); }

    get id(): string { return this.resource.id; }

    get portalUrl(): Uri {
        const url: string = `${this.schedulerResource.subscription.environment.portalUrl}/#@${this.schedulerResource.subscription.tenantId}/resource${this.id}`;

        return Uri.parse(url);
    }

    get viewProperties(): ViewPropertiesModel {
        return {
            label: this.resource.name,
            getData: async () => {
                if (!this.schedulerResource.resourceGroup) {
                    throw new Error('Azure resource does not have a valid resource group name.');
                }

                const json = await this.schedulerClient.getSchedulerTaskHub(
                    this.schedulerResource.subscription,
                    this.schedulerResource.resourceGroup,
                    this.schedulerResource.name,
                    this.resource.name);

                return json;
            }
        };
    }

    getChildren(): ProviderResult<DurableTaskSchedulerModel[]>
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
