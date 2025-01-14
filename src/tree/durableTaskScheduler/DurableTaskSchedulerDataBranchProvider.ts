import { type AzureSubscription, type AzureResource, type AzureResourceBranchDataProvider, type AzureResourceModel } from "@microsoft/vscode-azureresources-api";
import { type ProviderResult, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { treeUtils } from "../../utils/treeUtils";

interface DurableTaskHubResource {
    readonly id: string;
    readonly name: string;
    readonly properties: {
        readonly dashboardUrl: string;
    };
}

interface DurableTaskHubsResponse {
    readonly value: DurableTaskHubResource[];
}

interface DurableTaskSchedulerModelBase extends AzureResourceModel {
    getChildren(): ProviderResult<DurableTaskSchedulerModelBase[]>;

    getTreeItem(): TreeItem | Thenable<TreeItem>;
}

export class DurableTaskHubResourceModel implements DurableTaskSchedulerModelBase {
    constructor(private readonly subscription: AzureSubscription, private readonly resource: DurableTaskHubResource) {
    }

    public get azureResourceId() { return this.resource.id; }

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
    public constructor(private readonly resource: AzureResource) {
    }

    async getChildren(): Promise<DurableTaskHubResourceModel[]> {
        const armEndpoint = 'https://management.azure.com';
        const apiVersion = '2024-10-01-preview';

        const subscriptionId = this.resource.subscription.subscriptionId;
        const resourceGroupName = this.resource.resourceGroup;
        const provider = 'Microsoft.DurableTask';
        const schedulerName = this.resource.name;

        const authSession = await this.resource.subscription.authentication.getSession();

        if (!authSession) {
            return [];
        }

        const accessToken = authSession.accessToken;

        const taskHubsUrl = `${armEndpoint}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/${provider}/schedulers/${schedulerName}/taskHubs?api-version=${apiVersion}`;

        const request = new Request(taskHubsUrl);

        request.headers.append('Authorization', `Bearer ${accessToken}`);

        const response = await fetch(request);

        const taskHubs = await response.json() as DurableTaskHubsResponse;

        return taskHubs.value.map(resource => new DurableTaskHubResourceModel(this.resource.subscription, resource));
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        return new TreeItem(this.name, TreeItemCollapsibleState.Collapsed);
    }

    public get id(): string | undefined { return this.resource.id; }

    public get azureResourceId() { return this.resource.id; }

    public get name() { return this.resource.name; }
}

export class DurableTaskSchedulerDataBranchProvider implements AzureResourceBranchDataProvider<DurableTaskSchedulerModelBase> {
    getChildren(element: DurableTaskSchedulerModelBase): ProviderResult<DurableTaskSchedulerModelBase[]> {
        return element.getChildren();
    }

    getResourceItem(element: AzureResource): DurableTaskSchedulerResourceModel | Thenable<DurableTaskSchedulerResourceModel> {
        return new DurableTaskSchedulerResourceModel(element);
    }

    getTreeItem(element: DurableTaskSchedulerModelBase): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }
}
