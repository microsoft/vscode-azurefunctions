/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, type AzExtTreeItem, type IActionContext, type TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import { ThemeIcon } from 'vscode';
import { localize } from '../../localize';
import { type IProjectTreeItem } from '../IProjectTreeItem';
import { getProjectContextValue, ProjectAccess, ProjectResource } from '../projectContextValues';
import { type SlotTreeItem } from '../SlotTreeItem';
import { ManagedIdentitiesTreeItem } from './ManagedIdentitiesTreeItem';
import { RoleAccessTreeItem } from './RoleAccessTreeItem';
import { SystemIdentityTreeItem } from './SystemIdentityTreeItem';


export abstract class IdentitiesTreeItemBase extends AzExtParentTreeItem {
    public readonly label: string = localize('Identities', 'Identities');
    public readonly childTypeLabel: string = localize('Identity', 'Identity');
    public parent: AzExtParentTreeItem & IProjectTreeItem;
    public suppressMaskLabel: boolean = true;

    public abstract isReadOnly: boolean;

    public constructor(parent: AzExtParentTreeItem & IProjectTreeItem) {
        super(parent);
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.source, this.access, ProjectResource.Identities);
    }

    // public get description(): string {
    //     return this.isReadOnly ? localize('readOnly', 'Read-only') : '';
    // }

    public get access(): ProjectAccess {
        return this.isReadOnly ? ProjectAccess.ReadOnly : ProjectAccess.ReadWrite;
    }

    public get id(): string {
        return 'identities';
    }

    public get iconPath(): TreeItemIconPath {
        return new ThemeIcon('key');
    }

}

export class AppIdentityTreeItem extends AzExtParentTreeItem {
    public readonly label: string = localize('Identity', 'Identity');
    // public readonly childTypeLabel: string = localize('Identity', 'Identity');
    public readonly parent: AzExtParentTreeItem & IProjectTreeItem & SlotTreeItem;
    public suppressMaskLabel: boolean = true;
    public isReadOnly: boolean = false;

    private constructor(parent: SlotTreeItem) {
        super(parent);
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.source, this.access, ProjectResource.Identities);
    }

    // public get description(): string {
    //     return localize('identitiesDescription', 'My Managed Identities and Role Access');
    // }

    public get access(): ProjectAccess {
        return ProjectAccess.ReadWrite;
    }

    public get id(): string {
        return 'appIdentityView';
    }

    public get iconPath(): TreeItemIconPath {
        return new ThemeIcon('key');
    }

    public static async createAppIdentityTreeItem(context: IActionContext, parent: SlotTreeItem): Promise<AppIdentityTreeItem> {
        const ti: AppIdentityTreeItem = new AppIdentityTreeItem(parent);
        // initialize
        await ti.initAsync(context);
        return ti;
    }

    public async initAsync(_context: IActionContext): Promise<void> {
        // this.isReadOnly = await this.parent.isReadOnly(context);
    }

    public async refreshImpl(context: IActionContext): Promise<void> {
        await this.initAsync(context);
        await this.loadAllChildren(context);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        const systemIdentitiesTreeItem: AzExtTreeItem = SystemIdentityTreeItem.create(this);
        const managedIdentitiesTreeItem = await ManagedIdentitiesTreeItem.createManagedIdentitiesTreeItem(context, this.parent);
        const roleAccessTreeItem = await RoleAccessTreeItem.createRoleAccessTreeItem(context, this.parent);


        const children: AzExtTreeItem[] = [systemIdentitiesTreeItem, managedIdentitiesTreeItem, roleAccessTreeItem];
        return children;
    }

    public compareChildrenImpl(_ti1: AzExtTreeItem, _ti2: AzExtTreeItem): number {
        // don't sort
        return 0;
    }
}
