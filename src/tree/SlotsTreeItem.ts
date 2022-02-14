/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Site, WebSiteManagementClient } from '@azure/arm-appservice';
import { createSlot, ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzExtParentTreeItem, AzExtTreeItem, IActionContext, ICreateChildImplContext, TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import { showSiteCreated } from '../commands/createFunctionApp/showSiteCreated';
import { localize } from '../localize';
import { createWebSiteClient } from '../utils/azureClients';
import { treeUtils } from '../utils/treeUtils';
import { ProductionSlotTreeItem } from './ProductionSlotTreeItem';
import { SlotTreeItem } from './SlotTreeItem';

export class SlotsTreeItem extends AzExtParentTreeItem {
    public static contextValue: string = 'azFuncSlots';
    public readonly contextValue: string = SlotsTreeItem.contextValue;
    public readonly label: string = localize('slots', 'Slots');
    public readonly childTypeLabel: string = localize('slot', 'Slot');
    public readonly parent: ProductionSlotTreeItem;
    public suppressMaskLabel: boolean = true;

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
        return !!this._nextLink;
    }

    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const client: WebSiteManagementClient = await createWebSiteClient([context, this]);
        const webAppCollection: Site[] = await uiUtils.listAllIterator(client.webApps.listSlots(this.parent.site.resourceGroup, this.parent.site.siteName));

        return await this.createTreeItemsWithErrorHandling(
            webAppCollection,
            'azFuncInvalidSlot',
            (site: Site) => {
                return new SlotTreeItem(this, new ParsedSite(site, this.subscription));
            },
            (site: Site) => {
                return site.name;
            }
        );
    }

    public async createChildImpl(context: ICreateChildImplContext): Promise<AzExtTreeItem> {
        const existingSlots: SlotTreeItem[] = <SlotTreeItem[]>await this.getCachedChildren(context);
        const newSite: Site = await createSlot(this.parent.site, existingSlots.map(s => s.site), context);
        const parsedSite = new ParsedSite(newSite, this.subscription);
        showSiteCreated(parsedSite, context);
        return new SlotTreeItem(this, parsedSite);
    }
}
