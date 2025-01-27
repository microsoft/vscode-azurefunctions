/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureAuthentication, type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { localize } from '../../localize';

export interface DurableTaskHubResource {
    readonly id: string;
    readonly name: string;
    readonly properties: {
        readonly dashboardUrl: string;
    };
}

export interface DurableTaskSchedulerClient {
    getSchedulerTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource>;
    getSchedulerTaskHubs(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskHubResource[]>;
}

export class HttpDurableTaskSchedulerClient implements DurableTaskSchedulerClient {
    async getSchedulerTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource> {
        const taskHubsUrl = `${HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName)}/taskHubs/${taskHubName}`;

        const taskHub = await this.getAsJson<DurableTaskHubResource>(taskHubsUrl, subscription.authentication);

        return taskHub;
    }

    async getSchedulerTaskHubs(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskHubResource[]> {
        const taskHubsUrl = `${HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName)}/taskHubs`;

        const response = await this.getAsJson<{ value: DurableTaskHubResource[] }>(taskHubsUrl, subscription.authentication);

        return response.value;
    }

    private static getBaseUrl(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string) {
        const provider = 'Microsoft.DurableTask';

        return `${subscription.environment.resourceManagerEndpointUrl}/subscriptions/${subscription.subscriptionId}/resourceGroups/${resourceGroupName}/providers/${provider}/schedulers/${schedulerName}`;
    }

    private async getAsJson<T>(url: string, authentication: AzureAuthentication): Promise<T> {
        const apiVersion = '2024-10-01-preview';
        const versionedUrl = `${url}?api-version=${apiVersion}`;

        const authSession = await authentication.getSession();

        if (!authSession) {
            throw new Error(localize('noAuthenticationSessionErrorMessage', 'Unable to obtain an authentication session.'));
        }

        const accessToken = authSession.accessToken;

        const request = new Request(versionedUrl);

        request.headers.append('Authorization', `Bearer ${accessToken}`);

        const response = await fetch(request);

        if (!response.ok) {
            throw new Error(localize('failureInvokingArmErrorMessage', 'Azure management API returned an unsuccessful response.'));
        }

        return await response.json() as T;
    }
}
