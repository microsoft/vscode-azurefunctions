/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { AzExtParentTreeItem, createContextValue, type AzExtTreeItem, type IActionContext, type TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import { ThemeIcon } from 'vscode';
import { localize } from '../../localize';
import { type SlotTreeItem } from '../SlotTreeItem';
import { createSystemIdentityTreeItem } from './SystemIdentityTreeItemBase';
import { UserAssignedIdentitiesTreeItem } from './UserAssignedIdentitiesTreeItem';

export class ManagedIdentityTreeItem extends AzExtParentTreeItem {
    public readonly label: string = localize('Identity', 'Identity');
    public static contextValue: string = 'azFuncManagedIdentity';
    public readonly parent: SlotTreeItem;
    public readonly site: ParsedSite;
    public suppressMaskLabel: boolean = true;

    constructor(parent: SlotTreeItem) {
        super(parent);
    }

    public get contextValue(): string {
        return createContextValue([ManagedIdentityTreeItem.contextValue]);
    }

    public get id(): string {
        return 'appIdentityView';
    }

    public get iconPath(): TreeItemIconPath {
        return new ThemeIcon('key');
    }

    public async refreshImpl(context: IActionContext): Promise<void> {
        await this.loadAllChildren(context);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        const systemIdentitiesTreeItem: AzExtTreeItem = await createSystemIdentityTreeItem(context, this);
        const userAssignedIdentitiesTreeItem = new UserAssignedIdentitiesTreeItem(this.parent);
        return [systemIdentitiesTreeItem, userAssignedIdentitiesTreeItem];
    }

    public compareChildrenImpl(_ti1: AzExtTreeItem, _ti2: AzExtTreeItem): number {
        // don't sort
        return 0;
    }
}
