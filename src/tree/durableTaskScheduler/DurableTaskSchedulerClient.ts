import { type AzureSubscription } from "@microsoft/vscode-azureresources-api";

export interface DurableTaskHubResource {
    readonly id: string;
    readonly name: string;
    readonly properties: {
        readonly dashboardUrl: string;
    };
}

interface DurableTaskHubsResponse {
    readonly value: DurableTaskHubResource[];
}

export interface DurableTaskSchedulerClient {
    getSchedulerTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource>;
    getSchedulerTaskHubs(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskHubResource[]>;
}

export class HttpDurableTaskSchedulerClient implements DurableTaskSchedulerClient {
    async getSchedulerTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource> {
        const armEndpoint = subscription.environment.resourceManagerEndpointUrl;
        const apiVersion = '2024-10-01-preview';

        const subscriptionId = subscription.subscriptionId;
        const provider = 'Microsoft.DurableTask';

        const authSession = await subscription.authentication.getSession();

        if (!authSession) {
            throw new Error('Unable to obtain an authentication session.');
        }

        const accessToken = authSession.accessToken;

        const taskHubsUrl = `${armEndpoint}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/${provider}/schedulers/${schedulerName}/taskHubs/${taskHubName}?api-version=${apiVersion}`;

        const request = new Request(taskHubsUrl);

        request.headers.append('Authorization', `Bearer ${accessToken}`);

        const response = await fetch(request);

        const taskHub = await response.json() as DurableTaskHubResource;

        return taskHub;
    }

    async getSchedulerTaskHubs(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskHubResource[]> {
        const armEndpoint = subscription.environment.resourceManagerEndpointUrl;
        const apiVersion = '2024-10-01-preview';

        const subscriptionId = subscription.subscriptionId;
        const provider = 'Microsoft.DurableTask';

        const authSession = await subscription.authentication.getSession();

        if (!authSession) {
            throw new Error('Unable to obtain an authentication session.');
        }

        const accessToken = authSession.accessToken;

        const taskHubsUrl = `${armEndpoint}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/${provider}/schedulers/${schedulerName}/taskHubs?api-version=${apiVersion}`;

        const request = new Request(taskHubsUrl);

        request.headers.append('Authorization', `Bearer ${accessToken}`);

        const response = await fetch(request);

        const taskHubs = await response.json() as DurableTaskHubsResponse;

        return taskHubs.value;
    }
}
