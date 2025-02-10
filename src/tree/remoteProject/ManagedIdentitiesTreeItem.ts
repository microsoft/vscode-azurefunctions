/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceManagementClient, type GenericResourceExpanded, type Identity } from '@azure/arm-resources';
import { AzExtParentTreeItem, createContextValue, type AzExtTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { type IProjectTreeItem } from '../IProjectTreeItem';
import { getProjectContextValue, ProjectAccess, ProjectResource } from '../projectContextValues';
import { type SlotTreeItem } from '../SlotTreeItem';
import { ManagedIdentityTreeItem } from './ManagedIdentityTreeItem';

export interface ManagedIdentity extends Identity {
    resourceId?: string;
    name?: string;
}
export abstract class ManagedIdentitiesTreeItemBase extends AzExtParentTreeItem {
    public readonly label: string = localize('ManagedIdentities', 'Managed');
    public readonly childTypeLabel: string = localize('managedIdentity', 'Managed Identity');
    public parent: AzExtParentTreeItem & IProjectTreeItem;
    public suppressMaskLabel: boolean = true;

    public abstract isReadOnly: boolean;

    public constructor(parent: AzExtParentTreeItem & IProjectTreeItem) {
        super(parent);
    }

    public get contextValue(): string {
        // add context value
        return createContextValue([getProjectContextValue(this.parent.source, this.access, ProjectResource.Identities), 'assignNewIdentity']);
    }

    public get description(): string {
        return '';
    }

    public get access(): ProjectAccess {
        return this.isReadOnly ? ProjectAccess.ReadOnly : ProjectAccess.ReadWrite;
    }

    public get id(): string {
        return 'identities';
    }
}

export class ManagedIdentitiesTreeItem extends ManagedIdentitiesTreeItemBase {
    public readonly parent: SlotTreeItem;
    public isReadOnly: boolean;

    private _nextLink: string | undefined;

    private constructor(parent: SlotTreeItem) {
        super(parent);
    }

    public static async createManagedIdentitiesTreeItem(context: IActionContext, parent: SlotTreeItem): Promise<ManagedIdentitiesTreeItem> {
        const ti: ManagedIdentitiesTreeItem = new ManagedIdentitiesTreeItem(parent);
        // initialize
        await ti.initAsync(context);
        return ti;
    }

    public async initAsync(context: IActionContext): Promise<void> {
        this.isReadOnly = await this.parent.isReadOnly(context);
    }

    public async refreshImpl(context: IActionContext): Promise<void> {
        await this.initAsync(context);
        await this.loadAllChildren(context);
    }

    public hasMoreChildrenImpl(): boolean {
        return !!this._nextLink;
    }

    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        // Get all resources in a subscription
        const resourceClient = new ResourceManagementClient(this.parent.site.subscription.credentials, this.parent.site.subscription.subscriptionId);
        const resources: GenericResourceExpanded[] = [];
        for await (const resource of resourceClient.resources.list()) {
            resources.push(resource);
        }
        console.log(`FOUND RESOURCES:`);
        console.log(resources);

        // // 1. Find this current app's resource
        // const myResource = resources.find(resource => resource.id === this.parent.site.id);
        const myIdentity = this.parent.site.rawSite.identity;
        const identities: ManagedIdentity[] = [];
        const children: AzExtTreeItem[] = [];
        if (myIdentity) {
            if (myIdentity.type?.includes('UserAssigned')) {
                for (const [identityId, identityValue] of Object.entries(myIdentity.userAssignedIdentities || {})) {
                    identities.push({
                        type: 'UserAssigned',
                        resourceId: identityId,
                        name: resources.filter(resource => resource.id?.toLowerCase() === identityId.toLowerCase())[0]?.name,
                        ...identityValue,
                    });
                }
                children.push(...(await this.createTreeItemsWithErrorHandling<ManagedIdentity>(
                    identities,
                    'azFuncInvalidIdentity',
                    async (identity: ManagedIdentity) => await ManagedIdentityTreeItem.create(context, this, identity),
                    (identity: ManagedIdentity) => identity.name
                )));
            }
        }

        console.log(`FOUND IDENTITIES:`);
        console.log(identities);
        return children;
    }
}
