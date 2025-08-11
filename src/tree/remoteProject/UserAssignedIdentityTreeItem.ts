/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Identity } from '@azure/arm-msi';
import { createPortalUri, createRoleDefinitionsItems, RoleDefinitionsTreeItem, type RoleDefinitionsItem } from '@microsoft/vscode-azext-azureutils';
import { AzExtParentTreeItem, nonNullProp, type AzExtTreeItem, type IActionContext, type TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import { type AzureSubscription } from '@microsoft/vscode-azureresources-api';
import { type Uri } from 'vscode';
import { localize } from '../../localize';
import { treeUtils } from '../../utils/treeUtils';
import { type UserAssignedIdentitiesTreeItem } from './UserAssignedIdentitiesTreeItem';

export class UserAssignedIdentityTreeItem extends AzExtParentTreeItem {
    readonly portalUrl: Uri;
    public readonly parent: UserAssignedIdentitiesTreeItem;
    public readonly identity: Identity;
    public contextValue: string = 'userAssignedIdentity';
    children: AzExtTreeItem[] = [];
    public constructor(parent: UserAssignedIdentitiesTreeItem, identity: Identity) {
        super(parent);
        this.parent = parent;
        this.identity = identity;
        this.portalUrl = createPortalUri(parent.parent.subscription as unknown as AzureSubscription, nonNullProp(identity, 'id'));
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath("ManagedIdentityUserAssignedIdentities");
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        const roleDefinitionsItem: RoleDefinitionsItem[] = await createRoleDefinitionsItems(context, this.parent.subscription, this.identity, this.parent.parent.site.id);
        return roleDefinitionsItem.map(rd => new RoleDefinitionsTreeItem(this, rd));
    }

    public hasMoreChildrenImpl(): boolean {
        return false
    }

    public get id(): string {
        return this.identity.principalId || '';
    }

    public get label(): string {
        return this.identity.name || this.identity.principalId || this.identity.tenantId || localize('userAssigned', 'User assigned');
    }
}
