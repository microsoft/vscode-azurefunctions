/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, type AzExtTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { getProjectContextValue, ProjectResource } from '../projectContextValues';
import { type AppIdentityTreeItem } from './AppIdentityTreeItem';
import { type ManagedIdentity } from './ManagedIdentitiesTreeItem';

export class SystemIdentityTreeItem extends AzExtParentTreeItem {
    public readonly parent: AppIdentityTreeItem;
    public readonly identity: ManagedIdentity;

    public constructor(parent: AppIdentityTreeItem, identity: ManagedIdentity) {
        super(parent);
        this.parent = parent;
        this.identity = identity;
    }

    public get id(): string {
        return this.identity.resourceId || this.identity.principalId || '';
    }

    public get label(): string {
        return localize('managedIdentity', 'System assigned');
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Identities, this.label);
    }

    public get description(): string | undefined {
        if (this.identity.type === 'SystemAssigned') {
            return 'System Assigned';
        } else if (this.identity.type === 'UserAssigned') {
            return "User Assigned";
        }
        return undefined;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, _context: IActionContext): Promise<AzExtTreeItem[]> {
        return [];
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }
}
