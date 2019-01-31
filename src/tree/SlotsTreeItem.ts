/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient, WebSiteManagementModels } from 'azure-arm-website';
import { createSlot, ISiteTreeRoot, SiteClient } from 'vscode-azureappservice';
import { AzureParentTreeItem, AzureTreeItem, createAzureClient, createTreeItemsWithErrorHandling } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { ProductionSlotTreeItem } from './ProductionSlotTreeItem';
import { SlotTreeItem } from './SlotTreeItem';

export class SlotsTreeItem extends AzureParentTreeItem<ISiteTreeRoot> {
    public static contextValue: string = 'azFuncSlots';
    public readonly contextValue: string = SlotsTreeItem.contextValue;
    public readonly label: string = localize('slots', 'Slots');
    public readonly description: string = localize('preview', 'Preview');
    public readonly childTypeLabel: string = localize('slot', 'Slot');
    public readonly parent: ProductionSlotTreeItem;

    private _nextLink: string | undefined;

    public constructor(parent: ProductionSlotTreeItem) {
        super(parent);
    }

    public get id(): string {
        return 'slots';
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(this.contextValue);
    }

    public hasMoreChildrenImpl(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildrenImpl(clearCache: boolean): Promise<AzureTreeItem<ISiteTreeRoot>[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const client: WebSiteManagementClient = createAzureClient(this.root, WebSiteManagementClient);
        const webAppCollection: WebSiteManagementModels.WebAppCollection = this._nextLink === undefined ?
            await client.webApps.listSlots(this.root.client.resourceGroup, this.root.client.siteName) :
            await client.webApps.listSlotsNext(this._nextLink);

        this._nextLink = webAppCollection.nextLink;

        return await createTreeItemsWithErrorHandling(
            this,
            webAppCollection,
            'azFuncInvalidSlot',
            async (site: WebSiteManagementModels.Site) => {
                const siteClient: SiteClient = new SiteClient(site, this.root);
                return new SlotTreeItem(this, siteClient);
            },
            (site: WebSiteManagementModels.Site) => {
                return site.name;
            }
        );
    }

    public async createChildImpl(showCreatingTreeItem: (label: string) => void): Promise<AzureTreeItem<ISiteTreeRoot>> {
        const existingSlots: SlotTreeItem[] = <SlotTreeItem[]>await this.getCachedChildren();
        const newSite: WebSiteManagementModels.Site = await createSlot(this.root, existingSlots, showCreatingTreeItem);
        return new SlotTreeItem(this, new SiteClient(newSite, this.root));
    }
}
