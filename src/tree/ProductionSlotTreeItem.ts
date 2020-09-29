/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import { SiteClient } from 'vscode-azureappservice';
import { AzExtTreeItem } from 'vscode-azureextensionui';
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
        children.push(this._slotsTreeItem);
        return children;
    }

    public async pickTreeItemImpl(expectedContextValues: (string | RegExp)[]): Promise<AzExtTreeItem | undefined> {
        for (const expectedContextValue of expectedContextValues) {
            switch (expectedContextValue) {
                case SlotsTreeItem.contextValue:
                case SlotTreeItem.contextValue:
                    return this._slotsTreeItem;
                default:
            }
        }

        return super.pickTreeItemImpl(expectedContextValues);
    }
}
