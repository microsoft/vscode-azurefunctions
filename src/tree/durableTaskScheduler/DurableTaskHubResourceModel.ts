/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ViewPropertiesModel } from "@microsoft/vscode-azureresources-api";
import { type DurableTaskSchedulerModel } from "./DurableTaskSchedulerModel";
import { type DurableTaskHubResource, type DurableTaskSchedulerClient } from "./DurableTaskSchedulerClient";
import { type ProviderResult, TreeItem, Uri } from "vscode";
import { treeUtils } from "../../utils/treeUtils";
import { localize } from '../../localize';
import { type DurableTaskSchedulerResourceModel } from "./DurableTaskSchedulerResourceModel";

export class DurableTaskHubResourceModel implements DurableTaskSchedulerModel {
    constructor(
        public readonly scheduler: DurableTaskSchedulerResourceModel,
        private readonly resource: DurableTaskHubResource,
        private readonly schedulerClient: DurableTaskSchedulerClient) {
    }

    public get azureResourceId() { return this.resource.id; }

    get dashboardUrl(): Uri { return Uri.parse(this.resource.properties.dashboardUrl); }

    get id(): string { return this.resource.id; }

    get portalUrl(): Uri {
        const url: string = `${this.scheduler.subscription.environment.portalUrl}/#@${this.scheduler.subscription.tenantId}/resource${this.id}`;

        return Uri.parse(url);
    }

    get viewProperties(): ViewPropertiesModel {
        return {
            label: this.resource.name,
            getData: async () => {
                if (!this.scheduler.resourceGroup) {
                    throw new Error(localize('noResourceGroupErrorMessage', 'Azure resource does not have a valid resource group name.'));
                }

                const json = await this.schedulerClient.getSchedulerTaskHub(
                    this.scheduler.subscription,
                    this.scheduler.resourceGroup,
                    this.scheduler.name,
                    this.resource.name);

                return json ?? '';
            }
        };
    }

    getChildren(): ProviderResult<DurableTaskSchedulerModel[]>
    {
        return [];
    }

    async getTreeItem(): Promise<TreeItem>
    {
        const treeItem = new TreeItem(this.name)

        treeItem.iconPath = treeUtils.getIconPath('durableTaskScheduler/DurableTaskScheduler');
        treeItem.contextValue = 'azFunc.dts.taskHub';

        const json = await this.schedulerClient.getSchedulerTaskHub(
            this.scheduler.subscription,
            this.scheduler.resourceGroup,
            this.scheduler.name,
            this.name);

        if (json?.properties.provisioningState !== 'Succeeded') {
            treeItem.description = localize('taskHubDescription', '({0})', json?.properties.provisioningState || 'Deleted');
        }

        return treeItem;
    }

    get name() { return this.resource.name; }
}
