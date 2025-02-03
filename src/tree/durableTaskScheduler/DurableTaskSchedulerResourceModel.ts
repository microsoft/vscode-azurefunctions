/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ViewPropertiesModel, type AzureResource, type AzureResourceModel } from "@microsoft/vscode-azureresources-api";
import { type DurableTaskSchedulerModel } from "./DurableTaskSchedulerModel";
import { type DurableTaskSchedulerClient } from "./DurableTaskSchedulerClient";
import { DurableTaskHubResourceModel } from "./DurableTaskHubResourceModel";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { localize } from '../../localize';

export class DurableTaskSchedulerResourceModel implements DurableTaskSchedulerModel, AzureResourceModel {
    public constructor(
        private readonly resource: AzureResource,
        private readonly schedulerClient: DurableTaskSchedulerClient,
        private readonly refreshModel: (model: DurableTaskSchedulerModel | undefined) => void) {
    }

    async getChildren(): Promise<DurableTaskHubResourceModel[]> {
        if (!this.resource.resourceGroup) {
            throw new Error(localize('noResourceGroupErrorMessage', 'Azure resource does not have a valid resource group name.'));
        }

        const taskHubs = await this.schedulerClient.getSchedulerTaskHubs(this.resource.subscription, this.resource.resourceGroup, this.resource.name);

        return taskHubs.map(resource => new DurableTaskHubResourceModel(this, resource, this.schedulerClient));
    }

    async getTreeItem(): Promise<TreeItem> {
        const treeItem = new TreeItem(this.name, TreeItemCollapsibleState.Collapsed);

        treeItem.contextValue = 'azFunc.dts.scheduler';

        if (this.resource.resourceGroup) {
            const json = await this.schedulerClient.getScheduler(
                this.resource.subscription,
                this.resource.resourceGroup,
                this.resource.name);

            if (json?.properties.provisioningState !== 'Succeeded') {
                treeItem.description = localize('schedulerDescription', '({0})', json?.properties.provisioningState ?? 'Deleted');
            }
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
