/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Identity } from '@azure/arm-msi';
import { createManagedServiceIdentityClient, uiUtils } from '@microsoft/vscode-azext-azureutils';
import { AzExtParentTreeItem, type AzExtTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { type SlotTreeItem } from '../SlotTreeItem';
import { UserAssignedIdentityTreeItem } from './UserAssignedIdentityTreeItem';

export class UserAssignedIdentitiesTreeItem extends AzExtParentTreeItem {
    public readonly label: string = localize('userAssignedIdentities', 'User Assigned');
    public readonly parent: SlotTreeItem;
    public isReadOnly: boolean;
    public readonly contextValue: string = 'userAssignedIdentities';
    public get id(): string {
        return 'userAssignedIdentities';
    }

    private _nextLink: string | undefined;

    constructor(parent: SlotTreeItem) {
        super(parent);
    }

    public async refreshImpl(context: IActionContext): Promise<void> {
        await this.loadAllChildren(context);
    }

    public hasMoreChildrenImpl(): boolean {
        return !!this._nextLink;
    }

    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        await this.parent.initSite(context);
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
                    (identity: Identity) => new UserAssignedIdentityTreeItem(this, identity),
                    (identity: Identity) => identity.name
                )));
            }
        }

        return children;
    }
}
