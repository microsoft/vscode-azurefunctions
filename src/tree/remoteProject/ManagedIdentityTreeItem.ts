/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem, type IActionContext, type TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { treeUtils } from '../../utils/treeUtils';
import { getProjectContextValue, ProjectResource } from '../projectContextValues';
import { type ManagedIdentitiesTreeItem, type ManagedIdentity } from './ManagedIdentitiesTreeItem';

export class ManagedIdentityTreeItem extends AzExtTreeItem {
    public constructor(parent: ManagedIdentitiesTreeItem, identity: ManagedIdentity) {
        super(parent);
        this.parent = parent;
        this.identity = identity;
    }

    public static async create(_context: IActionContext, parent: ManagedIdentitiesTreeItem, identity: ManagedIdentity): Promise<ManagedIdentityTreeItem> {
        const ti: ManagedIdentityTreeItem = new ManagedIdentityTreeItem(parent, identity);
        // await ti.initAsync(context);
        return ti;
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath("ManagedIdentityUserAssignedIdentities");
    }

    public readonly parent: ManagedIdentitiesTreeItem;
    public readonly identity: ManagedIdentity;

    public get id(): string {
        return this.identity.principalId || '';
    }

    public get label(): string {
        return this.identity.name || this.identity.principalId || this.identity.tenantId || localize('managedIdentity', 'Managed Identity');
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Identities, this.label);
    }

    // public async deleteTreeItemImpl(context: IActionContext): Promise<void> { }

}
