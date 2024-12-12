/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem, type TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import { ThemeIcon } from 'vscode';
import { localize } from '../../localize';
import { getProjectContextValue, ProjectResource } from '../projectContextValues';
import { type ManagedIdentitiesTreeItem, type ManagedIdentity } from './ManagedIdentitiesTreeItem';

export class IdentityTreeItemBase extends AzExtTreeItem {
    public readonly parent: ManagedIdentitiesTreeItem;
    public readonly identity: ManagedIdentity;

    public constructor(parent: ManagedIdentitiesTreeItem, identity: ManagedIdentity) {
        super(parent);
        this.parent = parent;
        this.identity = identity;
    }

    public get id(): string {
        return this.identity.resourceId || this.identity.principalId || '';
    }

    public get label(): string {
        return this.identity.name || this.identity.principalId || this.identity.tenantId || localize('managedIdentity', 'Managed Identity');
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

    public get iconPath(): TreeItemIconPath {
        return new ThemeIcon('key');
    }
}
