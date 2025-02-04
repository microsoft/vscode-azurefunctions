/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Identity } from '@azure/arm-resources';
import { createPortalUri } from '@microsoft/vscode-azext-azureutils';
import { AzExtTreeItem } from '@microsoft/vscode-azext-utils';
import { type AzureSubscription } from '@microsoft/vscode-azureresources-api';
import { type Uri } from 'vscode';
import { localize } from '../../localize';
import { getProjectContextValue, ProjectResource } from '../projectContextValues';
import { type AppIdentityTreeItem } from './AppIdentityTreeItem';

export abstract class SystemIdentityTreeItemBase extends AzExtTreeItem {
    public readonly parent: AppIdentityTreeItem;
    public readonly identity?: Identity;
    public readonly portalUrl: Uri;

    public constructor(parent: AppIdentityTreeItem, identity?: Identity) {
        super(parent);
        this.parent = parent;
        this.identity = identity;
        this.portalUrl = createPortalUri(parent.parent.subscription as unknown as AzureSubscription, parent.parent.site.id + '/msi');
    }

    public static create(parent: AppIdentityTreeItem): EnabledIdentityTreeItem | DisabledIdentityTreeItem {
        if (!parent.parent.site.rawSite.identity?.type?.includes('SystemAssigned')) {
            return new DisabledIdentityTreeItem(parent);

        } else {
            return new EnabledIdentityTreeItem(parent, parent.parent.site.rawSite.identity);
        }
    }

    public get label(): string {
        return localize('systemIdentity', 'System assigned');
    }
}

class EnabledIdentityTreeItem extends SystemIdentityTreeItemBase {
    public readonly identity: Identity;
    public constructor(parent: AppIdentityTreeItem, identity: Identity) {
        super(parent, identity);
    }

    public get id(): string {
        return this.identity.principalId ?? '';
    }

    public get description(): string | undefined {
        return localize('enabled', 'Enabled');
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Identities, this.label, 'enabled');
    }
}
class DisabledIdentityTreeItem extends SystemIdentityTreeItemBase {
    public readonly parent: AppIdentityTreeItem;

    public constructor(parent: AppIdentityTreeItem) {
        super(parent);
        this.parent = parent;
    }

    public get id(): string {
        return `${this.parent.id}/disabled`
    }

    public get tooltip(): string {
        return localize('disabled', 'System assigned identity is disabled. Right-click to enable it.');
    }

    public get description(): string | undefined {
        return localize('disabled', 'Disabled');
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Identities, this.label, 'disabled');
    }
}
