/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureAuthentication, type AzureSubscription } from "@microsoft/vscode-azureresources-api";
import { localize } from '../../localize';
import { type CancellationToken } from "vscode";
import { delay } from "../../utils/delay";

interface FetchOptions {
    allowNotFound?: boolean;
    authentication: AzureAuthentication;
    contentType?: string | undefined;
    body?: string | undefined;
    method: string;
    url: string;
}

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

interface AzureAsyncOperationStatus {
    status: string;
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

export interface DurableTaskStatus {
    get: () => Promise<boolean | undefined>;
    waitForCompletion: (token: CancellationToken) => Promise<boolean | undefined>;
}

export interface DurableTaskSchedulerCreateResponse {
    scheduler: DurableTaskSchedulerResource;
    status: DurableTaskStatus;
}

export interface DurableTaskSchedulerClient {
    createScheduler(subscription: AzureSubscription, resourceGroupName: string, location: string, schedulerName: string): Promise<DurableTaskSchedulerCreateResponse>;
    createTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource>;

    deleteScheduler(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskStatus>;
    deleteTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskStatus>;

    getScheduler(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskSchedulerResource | undefined>;

    getSchedulerTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource | undefined>;
    getSchedulerTaskHubs(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskHubResource[]>;
}

export class HttpDurableTaskSchedulerClient implements DurableTaskSchedulerClient {
    async createScheduler(subscription: AzureSubscription, resourceGroupName: string, location: string, schedulerName: string): Promise<DurableTaskSchedulerCreateResponse> {
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

        const response = await this.putAsJson<DurableTaskSchedulerResource>(
            taskHubsUrl,
            request,
            subscription.authentication);

        return  {
            scheduler: response.value,
            status: this.createStatus(response.asyncOperation, subscription.authentication)
        };
    }

    async createTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource> {
        const taskHubsUrl = HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName, `/taskhubs/${taskHubName}`);

        const request: DurableTaskHubCreateRequest = {
            properties: {
            }
        };

        const taskHub = await this.putAsJson<DurableTaskHubResource>(
            taskHubsUrl,
            request,
            subscription.authentication);

        return taskHub.value;
    }

    async deleteScheduler(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskStatus> {
        const taskHubsUrl = HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName);

        const response = await this.delete(taskHubsUrl, subscription.authentication);

        return this.createStatus(response.asyncOperation, subscription.authentication);
    }

    async deleteTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskStatus> {
        const taskHubsUrl = HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName, `/taskhubs/${taskHubName}`);

        const response = await this.delete(taskHubsUrl, subscription.authentication);

        return this.createStatus(response.asyncOperation, subscription.authentication);
    }

    async getScheduler(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskSchedulerResource | undefined> {
        const schedulerUrl = HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName);

        const scheduler = await this.getAsJson<DurableTaskSchedulerResource>(schedulerUrl, subscription.authentication);

        return scheduler;
    }

    async getSchedulerTaskHub(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, taskHubName: string): Promise<DurableTaskHubResource | undefined> {
        const taskHubUrl = HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName, `/taskHubs/${taskHubName}`);

        const taskHub = await this.getAsJson<DurableTaskHubResource>(taskHubUrl, subscription.authentication);

        return taskHub;
    }

    async getSchedulerTaskHubs(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string): Promise<DurableTaskHubResource[]> {
        const taskHubsUrl = HttpDurableTaskSchedulerClient.getBaseUrl(subscription, resourceGroupName, schedulerName, '/taskHubs');

        const response = await this.getAsJson<{ value: DurableTaskHubResource[] }>(taskHubsUrl, subscription.authentication);

        return response?.value ?? [];
    }

    private static getBaseUrl(subscription: AzureSubscription, resourceGroupName: string, schedulerName: string, relativeUrl?: string | undefined) {
        const provider = 'Microsoft.DurableTask';
        const apiVersion = '2024-10-01-preview';

        let url = `${subscription.environment.resourceManagerEndpointUrl}subscriptions/${subscription.subscriptionId}/resourceGroups/${resourceGroupName}/providers/${provider}/schedulers/${schedulerName}`;

        if (relativeUrl) {
            url += relativeUrl;
        }

        url += `?api-version=${apiVersion}`;

        return url;
    }

    private async delete(url: string, authentication: AzureAuthentication): Promise<{ asyncOperation?: string }> {
        const response = await this.fetch({
            authentication,
            method: 'DELETE',
            url
        });

        return {
            asyncOperation: response.headers.get('Azure-AsyncOperation') ?? undefined
        }
    }

    private async getAsJson<T>(url: string, authentication: AzureAuthentication): Promise<T | undefined> {
        const response = await this.fetch({
            allowNotFound: true,
            authentication,
            method: 'GET',
            url
        });

        if (response.status === 404) {
            return undefined;
        }

        return await response.json() as T;
    }

    private async putAsJson<T>(url: string, body: unknown, authentication: AzureAuthentication): Promise<{ asyncOperation?: string, value: T }> {
        const response = await this.fetch({
            authentication,
            contentType: 'application/json',
            body: JSON.stringify(body),
            method: 'PUT',
            url
        });

        const value = await response.json() as T;

        return {
            asyncOperation: response.headers.get('Azure-AsyncOperation') ?? undefined,
            value
        }
    }

    private async fetch(options: FetchOptions): Promise<Response> {
        const { authentication, body, contentType, method, url } = options;

        const request = new Request(
            url,
            {
                body,
                method
            });

        const authSession = await authentication.getSession();

        if (!authSession) {
            throw new Error(localize('noAuthenticationSessionErrorMessage', 'Unable to obtain an authentication session.'));
        }

        const accessToken = authSession.accessToken;

        request.headers.set('Authorization', `Bearer ${accessToken}`);

        if (contentType) {
            request.headers.set('Content-Type', contentType);
        }

        const response = await fetch(request);

        if (!response.ok && (response.status !== 404 || options.allowNotFound !== true)) {
            throw new Error(localize('failureInvokingArmErrorMessage', 'The Azure management API returned an unsuccessful response ({0}): {1}', response.status, response.statusText));
        }

        return response;
    }

    private createStatus(asyncOperation: string | undefined, authentication: AzureAuthentication): DurableTaskStatus {
        const get = async () => {
            if (!asyncOperation) {
                return true;
            }

            const status = await this.getAsJson<AzureAsyncOperationStatus>(
                asyncOperation,
                authentication
            );

            switch (status?.status) {
                case 'Succeeded': return true;
                case 'Failed': return false;
                case 'Canceled': return false;
                default: return undefined;
            }
        };

        return {
            get,
            waitForCompletion: async token => {
                while (true) {
                    await delay(2500);

                    if (token.isCancellationRequested) {
                        return undefined;
                    }

                    const status = await get();

                    if (status === true)
                    {
                        return true;
                    }

                    if (status === false) {
                        return false;
                    }
                }
            }
        };
    }
}
