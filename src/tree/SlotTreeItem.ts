/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteClient } from 'vscode-azureappservice';
import { SlotsTreeItem } from './SlotsTreeItem';
import { SlotTreeItemBase } from './SlotTreeItemBase';

export class SlotTreeItem extends SlotTreeItemBase {
    public static contextValue: string = 'azFuncSlot';
    public readonly contextValue: string = SlotTreeItem.contextValue;
    public readonly parent: SlotsTreeItem;

    private constructor(parent: SlotsTreeItem, client: SiteClient) {
        super(parent, client);
    }

    public static async create(parent: SlotsTreeItem, client: SiteClient): Promise<SlotTreeItem> {
        const result: SlotTreeItem = new SlotTreeItem(parent, client);
        await result.refreshImpl();
        return result;
    }

    public get label(): string {
        // tslint:disable-next-line:no-non-null-assertion
        return this.root.client.slotName!;
    }
}
