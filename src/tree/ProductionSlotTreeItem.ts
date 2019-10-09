/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { SiteClient } from 'vscode-azureappservice';
import { AzExtTreeItem } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { SlotsTreeItem } from './SlotsTreeItem';
import { SlotTreeItem } from './SlotTreeItem';
import { SlotTreeItemBase } from './SlotTreeItemBase';
import { SubscriptionTreeItem } from './SubscriptionTreeItem';

export class ProductionSlotTreeItem extends SlotTreeItemBase {
    public static contextValue: string = 'azFuncProductionSlot';
    public readonly contextValue: string = ProductionSlotTreeItem.contextValue;

    private readonly _slotsTreeItem: SlotsTreeItem;

    public constructor(parent: SubscriptionTreeItem, client: SiteClient, site: WebSiteManagementModels.Site) {
        super(parent, client, site);
        this._slotsTreeItem = new SlotsTreeItem(this);
    }

    public get label(): string {
        return this.root.client.fullName;
    }

    public async loadMoreChildrenImpl(): Promise<AzExtTreeItem[]> {
        const children: AzExtTreeItem[] = await super.loadMoreChildrenImpl();
        if (await this.supportsSlots()) {
            children.push(this._slotsTreeItem);
        }
        return children;
    }

    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
        for (const expectedContextValue of expectedContextValues) {
            switch (expectedContextValue) {
                case SlotsTreeItem.contextValue:
                case SlotTreeItem.contextValue:
                    if (await this.supportsSlots()) {
                        return this._slotsTreeItem;
                    } else {
                        throw new Error(localize('slotNotSupported', 'Linux Consumption apps do not support slots.'));
                    }
                default:
            }
        }

        return super.pickTreeItemImpl(expectedContextValues);
    }

    private async supportsSlots(): Promise<boolean> {
        // Slots are not yet supported for Linux Consumption
        return !this.root.client.isLinux || !await this.getIsConsumption();
    }
}
