/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Identity } from '@azure/arm-resources';
import { createManagedServiceIdentityClient, createRoleDefinitionItems, RoleDefinitionsTreeItem, type RoleDefinitionsItem } from '@microsoft/vscode-azext-azureutils';
import { AzExtParentTreeItem, GenericTreeItem, type AzExtTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { ThemeIcon } from 'vscode';
import { localize } from '../../localize';
import { type ManagedIdentityTreeItem } from './ManagedIdentityTreeItem';

export abstract class SystemIdentityTreeItemBase extends AzExtParentTreeItem {
    public readonly parent: ManagedIdentityTreeItem;
    public static contextValue: string = 'systemIdentity';
    public state: string;

    public constructor(parent: ManagedIdentityTreeItem) {
        super(parent);
        this.parent = parent;
    }

    public static create(parent: ManagedIdentityTreeItem): SystemIdentityTreeItem | DisabledIdentityTreeItem {
        if (!parent.parent.site.rawSite.identity?.type?.includes('SystemAssigned')) {
            return new DisabledIdentityTreeItem(parent);
        } else {
            return new SystemIdentityTreeItem(parent, parent.parent.site.rawSite.identity);
        }
    }

    public get id(): string {
        return `${this.parent.id}/${this.state}`
    }

    public get label(): string {
        return localize('systemIdentity', 'System Assigned');
    }

    public get contextValue(): string {
        return SystemIdentityTreeItem.contextValue + '/' + this.state;
    }
}

class SystemIdentityTreeItem extends SystemIdentityTreeItemBase {
    public readonly identity: Identity;

    public constructor(parent: ManagedIdentityTreeItem, identity: Identity) {
        super(parent);
        this.identity = identity;
        this.state = 'enabled';
    }

    public get description(): string | undefined {
        return localize('enabled', 'Enabled');
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        const msiClient = await createManagedServiceIdentityClient([context, this.subscription]);
        const systemIdentity = await msiClient.systemAssignedIdentities.getByScope(this.parent.parent.id);
        const roleDefinitionsItem: RoleDefinitionsItem[] = await createRoleDefinitionItems(context, this.parent.subscription, systemIdentity)
        return roleDefinitionsItem.map(rd => new RoleDefinitionsTreeItem(this, rd));
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }
}
const rightClickToEnable: string = localize('disabled', 'System assigned identity is disabled. Right-click to enable.');
class DisabledIdentityTreeItem extends SystemIdentityTreeItemBase {
    public readonly parent: ManagedIdentityTreeItem;

    public constructor(parent: ManagedIdentityTreeItem) {
        super(parent);
        this.state = 'disabled';
        this.parent = parent;
    }

    public get description(): string | undefined {
        return localize('disabled', 'Disabled');
    }

    public async loadMoreChildrenImpl(): Promise<AzExtTreeItem[]> {
        const disabledTreeItem = new GenericTreeItem(this, {
            label: rightClickToEnable,
            contextValue: 'disabled',
            iconPath: new ThemeIcon('gear')
        });

        return [disabledTreeItem];
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public get tooltip(): string {
        return rightClickToEnable;
    }
}
