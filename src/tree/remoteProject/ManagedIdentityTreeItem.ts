/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem, type IActionContext, type TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import { ThemeIcon } from 'vscode';
import { localize } from '../../localize';
import { getProjectContextValue, ProjectResource } from '../projectContextValues';
import { type ManagedIdentitiesTreeItem, type ManagedIdentity } from './ManagedIdentitiesTreeItem';

export class ManagedIdentityTreeItem extends AzExtTreeItem {
    public readonly parent: ManagedIdentitiesTreeItem;
    public readonly identity: ManagedIdentity;

    private constructor(parent: ManagedIdentitiesTreeItem, identity: ManagedIdentity) {
        super(parent);
        this.parent = parent;
        this.identity = identity;
        // this.commandId = 'azureResourceGroups.viewProperties';
    }

    public static async create(_context: IActionContext, parent: ManagedIdentitiesTreeItem, identity: ManagedIdentity): Promise<ManagedIdentityTreeItem> {
        const ti: ManagedIdentityTreeItem = new ManagedIdentityTreeItem(parent, identity);
        // await ti.initAsync(context);
        return ti;
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

export function getFunctionNameFromId(id: string): string {
    const matches: RegExpMatchArray | null = id.match(/\/subscriptions\/[^\/]+\/resourceGroups\/[^\/]+\/providers\/Microsoft.Web\/sites\/[^\/]+(?:\/slots\/[^\/]+)?\/functions\/([^\/]+)/);

    if (matches === null || matches.length < 2) {
        throw new Error(localize('invalidFuncId', 'Invalid Functions Id'));
    }

    return matches[1];
}
