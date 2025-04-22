/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type WebSiteManagementClient } from '@azure/arm-appservice';
import { createSlot } from '@microsoft/vscode-azext-azureappservice';
import { uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzExtParentTreeItem, type AzExtTreeItem, type IActionContext, type ICreateChildImplContext, type TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import { localize } from '../localize';
import { createWebSiteClient } from '../utils/azureClients';
import { treeUtils } from '../utils/treeUtils';
import { ResolvedFunctionAppResource } from './ResolvedFunctionAppResource';
import { SlotTreeItem } from './SlotTreeItem';

export class SlotsTreeItem extends AzExtParentTreeItem {
    public static contextValue: string = 'azFuncSlots';
    public readonly contextValue: string = SlotsTreeItem.contextValue;
    public readonly label: string = localize('slots', 'Slots');
    public readonly childTypeLabel: string = localize('slot', 'Slot');
    public readonly parent: SlotTreeItem;
    public suppressMaskLabel: boolean = true;

    private _nextLink: string | undefined;

    public constructor(parent: SlotTreeItem) {
        super(parent);
    }

    public get id(): string {
        return 'slots';
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath(this.contextValue);
    }

    public hasMoreChildrenImpl(): boolean {
        return !!this._nextLink;
    }

    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const client: WebSiteManagementClient = await createWebSiteClient([context, this.subscription]);
        // https://github.com/Azure/azure-sdk-for-js/issues/20380
        const webAppCollection: Site[] = await uiUtils.listAllIterator(client.webApps.listSlots(this.parent.site.resourceGroup, this.parent.site.siteName));

        return await this.createTreeItemsWithErrorHandling(
            webAppCollection,
            'azFuncInvalidSlot',
            (site: Site) => {
                return new SlotTreeItem(this, new ResolvedFunctionAppResource(this.subscription, site));
            },
            (site: Site) => {
                return site.name;
            }
        );
    }

    public async createChildImpl(context: ICreateChildImplContext): Promise<AzExtTreeItem> {
        const existingSlots: SlotTreeItem[] = <SlotTreeItem[]>await this.getCachedChildren(context);
        const newSite: Site = await createSlot(this.parent.site, existingSlots.map(s => s.site), context);
        return new SlotTreeItem(this, new ResolvedFunctionAppResource(this.subscription, newSite));
    }
}
