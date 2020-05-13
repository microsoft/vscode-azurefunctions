/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { SiteClient } from 'vscode-azureappservice';
import { IContextValue, TreeItemIconPath } from 'vscode-azureextensionui';
import { treeUtils } from '../utils/treeUtils';
import { SlotsTreeItem } from './SlotsTreeItem';
import { SlotTreeItemBase } from './SlotTreeItemBase';

export class SlotTreeItem extends SlotTreeItemBase {
    public static contextValueId: string = 'slot';
    public static contextValue: IContextValue = { id: SlotTreeItem.contextValueId };
    public readonly contextValue: IContextValue = SlotTreeItem.contextValue;
    public readonly parent: SlotsTreeItem;

    public constructor(parent: SlotsTreeItem, client: SiteClient, site: WebSiteManagementModels.Site) {
        super(parent, client, site);
    }

    public get label(): string {
        // tslint:disable-next-line:no-non-null-assertion
        return this.root.client.slotName!;
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath(SlotTreeItem.contextValue.id);
    }
}
