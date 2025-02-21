/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Identity } from '@azure/arm-msi';
import { createManagedServiceIdentityClient, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzExtParentTreeItem, createContextValue, type AzExtTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { type IProjectTreeItem } from '../IProjectTreeItem';
import { getProjectContextValue, ProjectAccess, ProjectResource } from '../projectContextValues';
import { type SlotTreeItem } from '../SlotTreeItem';
import { ManagedIdentityTreeItem } from './ManagedIdentityTreeItem';

export abstract class ManagedIdentitiesTreeItemBase extends AzExtParentTreeItem {
    public readonly label: string = localize('ManagedIdentities', 'User Assigned');
    public readonly childTypeLabel: string = localize('managedIdentity', 'User Assigned Identity');
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

        const myIdentity = this.parent.site.rawSite.identity;
        const identities: Identity[] = [];
        const identityClient = await createManagedServiceIdentityClient([context, this.parent.subscription]);
        const userAssignedIdentities = await uiUtils.listAllIterator(identityClient.userAssignedIdentities.listBySubscription());

        const children: AzExtTreeItem[] = [];
        if (myIdentity) {
            if (myIdentity.type?.includes('UserAssigned')) {
                for (const identityId of Object.keys(myIdentity.userAssignedIdentities || {})) {
                    const identity = userAssignedIdentities.find((id) => id.id === identityId);
                    if (identity) {
                        identities.push(identity);
                    }
                }

                children.push(...(await this.createTreeItemsWithErrorHandling<Identity>(
                    identities,
                    'azFuncInvalidIdentity',
                    (identity: Identity) => new ManagedIdentityTreeItem(this, identity),
                    (identity: Identity) => identity.name
                )));
            }
        }

        return children;
    }
}
