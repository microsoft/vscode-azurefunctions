/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, type AzExtTreeItem, type IActionContext, type TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import { ThemeIcon } from 'vscode';
import { getProjectContextValue, ProjectResource } from '../projectContextValues';
import { RoleAccessItemTreeItem } from './RoleAccessItemTreeItem';
import { type RoleAccess, type RoleAccessTreeItem } from './RoleAccessTreeItem';

export class RoleAccessScopeTreeItem extends AzExtParentTreeItem {
    public readonly parent: RoleAccessTreeItem;
    public readonly scope: string;
    public readonly roles: RoleAccess[];

    private constructor(parent: RoleAccessTreeItem, scope: string, roles: RoleAccess[]) {
        super(parent);
        this.parent = parent;
        this.scope = scope;
        this.roles = roles;
        // this.commandId = 'azureResourceGroups.viewProperties';
    }

    public static async create(_context: IActionContext, parent: RoleAccessTreeItem, scope: string, roles: RoleAccess[]): Promise<RoleAccessScopeTreeItem> {
        const ti: RoleAccessScopeTreeItem = new RoleAccessScopeTreeItem(parent, scope, roles);
        // await ti.initAsync(context);
        return ti;
    }

    public get id(): string {
        return this.scope;
    }

    public get label(): string {
        return this.roles[0].resourceName || this.scope;
    }

    public get contextValue(): string {
        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Identities, this.label);
    }

    public get description(): string | undefined {
        return this.roles[0].resourceType;
    }

    public get iconPath(): TreeItemIconPath {
        return new ThemeIcon('symbol-field');
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        return await this.createTreeItemsWithErrorHandling<RoleAccess>(
            this.roles,
            'azFuncInvalidRoleAccess',
            async (role: RoleAccess) => await RoleAccessItemTreeItem.create(context, this.parent, role),
            (role: RoleAccess) => role.roleName
        );
    }

    // public get logStreamLabel(): string {
    //     return `${this.parent.parent.site.fullName}/${this.function.name}`;
    // }

    // public get logStreamPath(): string {
    //     return `application/functions/function/${encodeURIComponent(this.function.name)}`;
    // }

    // public get viewProperties(): ViewPropertiesModel {
    //     return {
    //         data: this.rawConfig,
    //         label: this.function.name,
    //     }
    // }

    // public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
    //     const message: string = localize('ConfirmDeleteFunction', 'Are you sure you want to delete function "{0}"?', this.function.name);
    //     const deleting: string = localize('DeletingFunction', 'Deleting function "{0}"...', this.function.name);
    //     const deleteSucceeded: string = localize('DeleteFunctionSucceeded', 'Successfully deleted function "{0}".', this.function.name);
    //     await context.ui.showWarningMessage(message, { modal: true, stepName: 'confirmDelete' }, DialogResponses.deleteResponse);
    //     await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async (): Promise<void> => {
    //         ext.outputChannel.appendLog(deleting);
    //         const client = await this.parent.parent.site.createClient(context);
    //         await client.deleteFunction(this.function.name);
    //         void window.showInformationMessage(deleteSucceeded);
    //         ext.outputChannel.appendLog(deleteSucceeded);
    //     });
    // }

    // public async getKey(context: IActionContext): Promise<string | undefined> {
    //     if (this.isAnonymous) {
    //         return undefined;
    //     }

    //     const client = await this.parent.parent.site.createClient(context);
    //     if (this.function.config.authLevel === HttpAuthLevel.function) {
    //         try {
    //             const functionKeys: IFunctionKeys = await client.listFunctionKeys(this.function.name);
    //             return nonNullProp(functionKeys, 'default');
    //         } catch (error) {
    //             if (parseError(error).errorType === 'NotFound') {
    //                 // There are no function-specific keys, fall through to admin key
    //             } else {
    //                 throw error;
    //             }
    //         }
    //     }

    //     const hostKeys: HostKeys = await client.listHostKeys();
    //     return nonNullProp(hostKeys, 'masterKey');
    // }
}
