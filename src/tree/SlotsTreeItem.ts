/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient, WebSiteManagementModels } from 'azure-arm-website';
import { createSlot, ISiteTreeRoot, SiteClient } from 'vscode-azureappservice';
import { AzExtTreeItem, AzureParentTreeItem, AzureTreeItem, createAzureClient, ICreateChildImplContext, TreeItemIconPath } from 'vscode-azureextensionui';
import { showSiteCreated } from '../commands/createFunctionApp/showSiteCreated';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { ProductionSlotTreeItem } from './ProductionSlotTreeItem';
import { SlotTreeItem } from './SlotTreeItem';

export class SlotsTreeItem extends AzureParentTreeItem<ISiteTreeRoot> {
    public static contextValue: string = 'azFuncSlots';
    public readonly contextValue: string = SlotsTreeItem.contextValue;
    public readonly label: string = localize('slots', 'Slots');
    public readonly childTypeLabel: string = localize('slot', 'Slot');
    public readonly parent: ProductionSlotTreeItem;

    private _nextLink: string | undefined;

    public constructor(parent: ProductionSlotTreeItem) {
        super(parent);
    }

    public get id(): string {
        return 'slots';
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath(this.contextValue);
    }

    public hasMoreChildrenImpl(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildrenImpl(clearCache: boolean): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const client: WebSiteManagementClient = createAzureClient(this.root, WebSiteManagementClient);
        const webAppCollection: WebSiteManagementModels.WebAppCollection = this._nextLink === undefined ?
            await client.webApps.listSlots(this.root.client.resourceGroup, this.root.client.siteName) :
            await client.webApps.listSlotsNext(this._nextLink);

        this._nextLink = webAppCollection.nextLink;

        return await this.createTreeItemsWithErrorHandling(
            webAppCollection,
            'azFuncInvalidSlot',
            async (site: WebSiteManagementModels.Site) => {
                const siteClient: SiteClient = new SiteClient(site, this.root);
                return new SlotTreeItem(this, siteClient, site);
            },
            (site: WebSiteManagementModels.Site) => {
                return site.name;
            }
        );
    }

    public async createChildImpl(context: ICreateChildImplContext): Promise<AzureTreeItem<ISiteTreeRoot>> {
        const existingSlots: SlotTreeItem[] = <SlotTreeItem[]>await this.getCachedChildren(context);
        const newSite: WebSiteManagementModels.Site = await createSlot(this.root, existingSlots, context);
        const siteClient: SiteClient = new SiteClient(newSite, this.root);
        showSiteCreated(siteClient, context);
        return new SlotTreeItem(this, siteClient, newSite);
    }
}
