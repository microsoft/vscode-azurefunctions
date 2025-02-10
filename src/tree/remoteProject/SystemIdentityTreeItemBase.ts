/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Identity } from '@azure/arm-resources';
import { AzExtTreeItem } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { getProjectContextValue, ProjectResource } from '../projectContextValues';
import { type AppIdentityTreeItem } from './AppIdentityTreeItem';

export abstract class SystemIdentityTreeItemBase extends AzExtTreeItem {
    public readonly parent: AppIdentityTreeItem;
    public state: string;

    public constructor(parent: AppIdentityTreeItem) {
        super(parent);
        this.parent = parent;
    }

    public static create(parent: AppIdentityTreeItem): SystemIdentityTreeItem | DisabledIdentityTreeItem {
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
        return localize('systemIdentity', 'System assigned');
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Identities, this.label, this.state);
    }
}

class SystemIdentityTreeItem extends SystemIdentityTreeItemBase {
    public readonly identity: Identity;

    public constructor(parent: AppIdentityTreeItem, identity: Identity) {
        super(parent);
        this.identity = identity;
        this.state = 'enabled';
    }

    public get description(): string | undefined {
        return localize('enabled', 'Enabled');
    }
}
class DisabledIdentityTreeItem extends SystemIdentityTreeItemBase {
    public readonly parent: AppIdentityTreeItem;

    public constructor(parent: AppIdentityTreeItem) {
        super(parent);
        this.state = 'disabled';
        this.parent = parent;
    }

    public get description(): string | undefined {
        return localize('disabled', 'Disabled');
    }

    public get tooltip(): string {
        return localize('disabled', 'System assigned identity is disabled. Right-click to enable it.');
    }
}
