/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ViewPropertiesModel, type AzureResource, type AzureResourceModel } from "@microsoft/vscode-azureresources-api";
import { type DurableTaskSchedulerModel } from "./DurableTaskSchedulerModel";
import { type DurableTaskSchedulerResource, type DurableTaskSchedulerClient } from "./DurableTaskSchedulerClient";
import { DurableTaskHubResourceModel } from "./DurableTaskHubResourceModel";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { localize } from '../../localize';
import * as retry from 'p-retry';

export class DurableTaskSchedulerResourceModel implements DurableTaskSchedulerModel, AzureResourceModel {
    public constructor(
        private readonly resource: AzureResource,
        private readonly schedulerResource: DurableTaskSchedulerResource | undefined,
        private readonly schedulerClient: DurableTaskSchedulerClient,
        private readonly refreshModel: (model: DurableTaskSchedulerModel | undefined) => void) {
    }

    async getChildren(): Promise<DurableTaskHubResourceModel[]> {
        if (!this.resource.resourceGroup) {
            throw new Error(localize('noResourceGroupErrorMessage', 'Azure resource does not have a valid resource group name.'));
        }

        // NOTE: The DTS RP may return a 500 when getting task hubs for a just-deleted scheduler.
        //       In the case of such a failure, just wait a moment and try again.

        const taskHubs = await retry(
            () => this.schedulerClient.getSchedulerTaskHubs(this.resource.subscription, this.resource.resourceGroup as string, this.resource.name),
            {
                retries: 3,
                minTimeout: 2500
            });

        return taskHubs.map(resource => new DurableTaskHubResourceModel(this, resource, this.schedulerClient));
    }

    async getTreeItem(): Promise<TreeItem> {
        const treeItem = new TreeItem(this.name, TreeItemCollapsibleState.Collapsed);

        treeItem.contextValue = 'azFunc.dts.scheduler azFunc.dts.schedulerEndpoint';

        if (this.schedulerResource?.properties.provisioningState !== 'Succeeded') {
            treeItem.description = localize('schedulerDescription', '({0})', this.schedulerResource?.properties.provisioningState ?? 'Deleted');
        }

        return treeItem;
    }

    refresh() {
        this.refreshModel(this);
    }

    public get id(): string | undefined { return this.resource.id; }

    public get azureResourceId() { return this.resource.id; }

    public get name() { return this.resource.name; }

    get resourceGroup() {
        if (!this.resource.resourceGroup) {
            throw new Error(localize('noResourceGroupErrorMessage', 'Azure resource does not have a valid resource group name.'));
        }

        return this.resource.resourceGroup;
    }

    get endpointUrl() { return this.schedulerResource?.properties.endpoint; }

    get subscription() { return this.resource.subscription; }

    get viewProperties(): ViewPropertiesModel {
        return {
            label: this.resource.name,
            getData: async () => {
                if (!this.resource.resourceGroup) {
                    throw new Error(localize('noResourceGroupErrorMessage', 'Azure resource does not have a valid resource group name.'));
                }

                const json = await this.schedulerClient.getScheduler(
                    this.resource.subscription,
                    this.resource.resourceGroup,
                    this.resource.name);

                return json ?? '';
            }
        };
    }
}
