/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureResource, type AzureResourceModel } from "@microsoft/vscode-azureresources-api";
import { type DurableTaskSchedulerModel } from "./DurableTaskSchedulerModel";
import { type DurableTaskSchedulerClient } from "./DurableTaskSchedulerClient";
import { DurableTaskHubResourceModel } from "./DurableTaskHubResourceModel";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { localize } from '../../localize';

export class DurableTaskSchedulerResourceModel implements DurableTaskSchedulerModel, AzureResourceModel {
    public constructor(private readonly resource: AzureResource, private readonly schedulerClient: DurableTaskSchedulerClient) {
    }

    async getChildren(): Promise<DurableTaskHubResourceModel[]> {
        if (!this.resource.resourceGroup) {
            throw new Error(localize('noResourceGroupErrorMessage', 'Azure resource does not have a valid resource group name.'));
        }

        const taskHubs = await this.schedulerClient.getSchedulerTaskHubs(this.resource.subscription, this.resource.resourceGroup, this.resource.name);

        return taskHubs.map(resource => new DurableTaskHubResourceModel(this.resource, resource, this.schedulerClient));
    }

    getTreeItem(): TreeItem | Thenable<TreeItem> {
        const treeItem = new TreeItem(this.name, TreeItemCollapsibleState.Collapsed);

        treeItem.contextValue = 'azFunc.dts.scheduler';

        return treeItem;
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
}
