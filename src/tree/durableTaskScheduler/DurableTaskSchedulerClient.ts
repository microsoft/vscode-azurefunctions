/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureAuthentication, type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { localize } from '../../localize';

interface DurableTaskSchedulerCreateRequest {
    readonly location: string;
    readonly properties: {
        readonly ipAllowlist: string[];
        readonly sku: {
            readonly name: string;
            readonly capacity: number;
        };
    };
    readonly tags: unknown;
}

interface DurableTaskHubCreateRequest {
    readonly properties: unknown;
}

export interface DurableTaskSchedulerResource {
    readonly id: string;
    readonly name: string;
    readonly properties: {
        readonly endpoint: string;
        readonly provisioningState: string;
    };
}

export interface DurableTaskHubResource {
    readonly id: string;
    readonly name: string;
    readonly properties: {
        readonly dashboardUrl: string;
        readonly provisioningState: string;
    };
}

export interface DurableTaskSchedulerClient {
    createScheduler(subscription: AzureSubscription, resourceGroupName: string, location: string, schedulerName: string): Promise<DurableTaskSchedulerResource>;
    createTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource>;

    deleteScheduler(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<void>;
    deleteTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<void>;

    getScheduler(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskSchedulerResource>;

    getSchedulerTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource>;
    getSchedulerTaskHubs(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskHubResource[]>;
}

export class HttpDurableTaskSchedulerClient implements DurableTaskSchedulerClient {
    async createScheduler(subscription: AzureSubscription, resourceGroupName: string, location: string, schedulerName: string): Promise<DurableTaskSchedulerResource> {
        const taskHubsUrl = HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName);

        const request: DurableTaskSchedulerCreateRequest = {
            location,
            properties: {
                ipAllowlist: ['0.0.0.0/0'],
                sku: {
                    name: 'Dedicated',
                    capacity: 1
                }
            },
            tags: {
            }
        };

        const scheduler = await this.putAsJson<DurableTaskSchedulerResource>(
            taskHubsUrl,
            request,
            subscription.authentication);

        return scheduler;
    }

    async createTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource> {
        const taskHubsUrl = `${HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName)}/taskhubs/${taskHubName}`;

        const request: DurableTaskHubCreateRequest = {
            properties: {
            }
        };

        const taskHub = await this.putAsJson<DurableTaskHubResource>(
            taskHubsUrl,
            request,
            subscription.authentication);

        return taskHub;
    }

    async deleteScheduler(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<void> {
        const taskHubsUrl = `${HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName)}`;

        await this.delete(taskHubsUrl, subscription.authentication);
    }

    async deleteTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<void> {
        const taskHubsUrl = `${HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName)}/taskhubs/${taskHubName}`;

        await this.delete(taskHubsUrl, subscription.authentication);
    }

    async getScheduler(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskSchedulerResource> {
        const schedulerUrl = HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName);

        const scheduler = await this.getAsJson<DurableTaskSchedulerResource>(schedulerUrl, subscription.authentication);

        return scheduler;
    }

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

        return `${subscription.environment.resourceManagerEndpointUrl}subscriptions/${subscription.subscriptionId}/resourceGroups/${resourceGroupName}/providers/${provider}/schedulers/${schedulerName}`;
    }

    private async delete(url: string, authentication: AzureAuthentication): Promise<void> {
        const apiVersion = '2024-10-01-preview';
        const versionedUrl = `${url}?api-version=${apiVersion}`;

        const authSession = await authentication.getSession();

        if (!authSession) {
            throw new Error(localize('noAuthenticationSessionErrorMessage', 'Unable to obtain an authentication session.'));
        }

        const accessToken = authSession.accessToken;

        const request = new Request(
            versionedUrl,
            {
                method: 'DELETE'
            });

        request.headers.append('Authorization', `Bearer ${accessToken}`);

        const response = await fetch(request);

        if (!response.ok) {
            throw new Error(localize('failureInvokingArmErrorMessage', 'Azure management API returned an unsuccessful response.'));
        }
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

    private async putAsJson<T>(url: string, body: unknown, authentication: AzureAuthentication): Promise<T> {
        const apiVersion = '2024-10-01-preview';
        const versionedUrl = `${url}?api-version=${apiVersion}`;

        const authSession = await authentication.getSession();

        if (!authSession) {
            throw new Error(localize('noAuthenticationSessionErrorMessage', 'Unable to obtain an authentication session.'));
        }

        const accessToken = authSession.accessToken;

        const request = new Request(
            versionedUrl,
            {
                body: JSON.stringify(body),
                method: 'PUT'
            });

        request.headers.set('Authorization', `Bearer ${accessToken}`);
        request.headers.set('Content-Type', 'application/json');

        const response = await fetch(request);

        if (!response.ok) {
            throw new Error(localize('failureInvokingArmErrorMessage', 'Azure management API returned an unsuccessful response.'));
        }

        return await response.json() as T;
    }
}
