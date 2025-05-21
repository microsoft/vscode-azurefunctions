/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureResource, type AzureResourceBranchDataProvider } from "@microsoft/vscode-azureresources-api";
import { EventEmitter, type ProviderResult, type TreeItem } from "vscode";
import { type DurableTaskSchedulerResource, type DurableTaskSchedulerClient } from "./DurableTaskSchedulerClient";
import { type DurableTaskSchedulerModel } from "./DurableTaskSchedulerModel";
import { DurableTaskSchedulerResourceModel } from "./DurableTaskSchedulerResourceModel";

export class DurableTaskSchedulerDataBranchProvider implements AzureResourceBranchDataProvider<DurableTaskSchedulerModel> {
    private readonly onDidChangeTreeDataEventEmitter = new EventEmitter<DurableTaskSchedulerModel | DurableTaskSchedulerModel[] | undefined | null | void>();

    constructor(private readonly schedulerClient: DurableTaskSchedulerClient) {
    }

    get onDidChangeTreeData() { return this.onDidChangeTreeDataEventEmitter.event; }

    getChildren(element: DurableTaskSchedulerModel): ProviderResult<DurableTaskSchedulerModel[]> {
        return element.getChildren();
    }

    async getResourceItem(azureResource: AzureResource): Promise<DurableTaskSchedulerResourceModel> {

        let schedulerResource: DurableTaskSchedulerResource | undefined;

        if (azureResource.resourceGroup) {
            schedulerResource = await this.schedulerClient.getScheduler(
                azureResource.subscription,
                azureResource.resourceGroup,
                azureResource.name);
        }

        return new DurableTaskSchedulerResourceModel(
            azureResource,
            schedulerResource,
            this.schedulerClient,
            model => this.onDidChangeTreeDataEventEmitter.fire(model));
    }

    getTreeItem(element: DurableTaskSchedulerModel): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }

    refresh() {
        this.onDidChangeTreeDataEventEmitter.fire();
    }
}
