/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createPortalUri, TargetServiceRoleAssignmentItem } from '@microsoft/vscode-azext-azureutils';
import { AzExtParentTreeItem, nonNullProp, type AzExtTreeItem, type IActionContext, type TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import { type AzureSubscription } from '@microsoft/vscode-azureresources-api';
import { type Uri } from 'vscode';
import { localize } from '../../localize';
import { treeUtils } from '../../utils/treeUtils';
import { getProjectContextValue, ProjectResource } from '../projectContextValues';
import { type ManagedIdentitiesTreeItem, type ManagedIdentity } from './ManagedIdentitiesTreeItem';

export class ManagedIdentityTreeItem extends AzExtParentTreeItem {
    readonly portalUrl: Uri;
    children: AzExtTreeItem[] = [];
    public constructor(parent: ManagedIdentitiesTreeItem, identity: ManagedIdentity) {
        super(parent);
        this.parent = parent;
        this.identity = identity;
        this.portalUrl = createPortalUri(parent.parent.subscription as unknown as AzureSubscription, nonNullProp(identity, 'resourceId'));
    }

    public static async create(context: IActionContext, parent: ManagedIdentitiesTreeItem, identity: ManagedIdentity): Promise<ManagedIdentityTreeItem> {
        const ti: ManagedIdentityTreeItem = new ManagedIdentityTreeItem(parent, identity);
        const targetServiceItem = await TargetServiceRoleAssignmentItem.createTargetServiceRoleAssignmentItem(context,
            parent.parent.subscription as unknown as AzureSubscription,
            identity);
        ti.children = targetServiceItem.getChildren();
        return ti;
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath("ManagedIdentityUserAssignedIdentities");
    }

    public async loadMoreChildrenImpl(): Promise<AzExtTreeItem[]> {
        return this.children;
    }

    public hasMoreChildrenImpl(): boolean {
        return false
    }

    public readonly parent: ManagedIdentitiesTreeItem;
    public readonly identity: ManagedIdentity;

    public get id(): string {
        return this.identity.principalId || '';
    }

    public get label(): string {
        return this.identity.name || this.identity.principalId || this.identity.tenantId || localize('userAssigned', 'User assigned');
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Identities, this.label);
    }
}
