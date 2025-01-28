/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Identity } from '@azure/arm-resources';
import { AzExtParentTreeItem, AzExtTreeItem, GenericTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { ThemeIcon } from 'vscode';
import { localize } from '../../localize';
import { getProjectContextValue, ProjectResource } from '../projectContextValues';
import { type AppIdentityTreeItem } from './AppIdentityTreeItem';

export class SystemIdentityTreeItem extends AzExtTreeItem {
    public readonly parent: AppIdentityTreeItem;
    public readonly identity: Identity;

    public constructor(parent: AppIdentityTreeItem, identity: Identity) {
        super(parent);
        this.parent = parent;
        this.identity = identity;
    }

    public static create(parent: AppIdentityTreeItem): SystemIdentityTreeItem | DisabledIdentityTreeItem {
        if (!parent.parent.site.rawSite.identity?.type?.includes('SystemAssigned')) {
            return new DisabledIdentityTreeItem(parent);

        } else {
            return new SystemIdentityTreeItem(parent, parent.parent.site.rawSite.identity);
        }
    }

    public get id(): string {
        return this.identity.principalId ?? '';
    }

    public get description(): string | undefined {
        return localize('enabled', 'Enabled');
    }

    public get label(): string {
        return localize('systemIdentity', 'System assigned');
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Identities, this.label, 'enabled');
    }
}
export class DisabledIdentityTreeItem extends AzExtParentTreeItem {
    public readonly parent: AppIdentityTreeItem;

    public constructor(parent: AppIdentityTreeItem) {
        super(parent);
        this.parent = parent;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, _context: IActionContext): Promise<AzExtTreeItem[]> {
        const disabledTreeItem = new GenericTreeItem(this, {
            label: localize('disabled', 'System-assigned identity is disabled. Click to enable it.'),
            contextValue: 'disabled',
            iconPath: new ThemeIcon('gear'),
            commandId: 'azureFunctions.enableSystemIdentity',
        });

        disabledTreeItem.commandArgs = [this];
        return [disabledTreeItem];
    }

    public get id(): string {
        return `${this.parent.id}/disabled`
    }

    public get tooltip(): string {
        return localize('disabled', 'System-assigned identity is disabled. Right-click to enable it.');
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public get description(): string | undefined {
        return localize('disabled', 'Disabled');
    }

    public get label(): string {
        return localize('systemIdentity', 'System assigned');
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Identities, this.label, 'disabled');
    }
}
