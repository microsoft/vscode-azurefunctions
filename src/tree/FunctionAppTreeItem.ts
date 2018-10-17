/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingsTreeItem, AppSettingTreeItem, deleteSite, ISiteTreeRoot, SiteClient } from 'vscode-azureappservice';
import { AzureParentTreeItem, AzureTreeItem } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionsTreeItem } from './FunctionsTreeItem';
import { FunctionTreeItem } from './FunctionTreeItem';
import { ProxiesTreeItem } from './ProxiesTreeItem';
import { ProxyTreeItem } from './ProxyTreeItem';

export class FunctionAppTreeItem extends AzureParentTreeItem<ISiteTreeRoot> {
    public static contextValue: string = 'azFuncFunctionApp';
    public readonly contextValue: string = FunctionAppTreeItem.contextValue;
    public logStreamPath: string = '';
    public readonly isLinuxPreview: boolean;

    private readonly _root: ISiteTreeRoot;
    private _state?: string;
    private readonly _functionsTreeItem: FunctionsTreeItem;
    private readonly _appSettingsTreeItem: AppSettingsTreeItem;
    private readonly _proxiesTreeItem: ProxiesTreeItem;

    public constructor(parent: AzureParentTreeItem, client: SiteClient, isLinuxPreview: boolean) {
        super(parent);
        this._root = Object.assign({}, parent.root, { client });
        this._state = client.initialState;
        this._functionsTreeItem = new FunctionsTreeItem(this);
        this._appSettingsTreeItem = new AppSettingsTreeItem(this);
        this._proxiesTreeItem = new ProxiesTreeItem(this);
        this.isLinuxPreview = isLinuxPreview;
    }

    // overrides ISubscriptionRoot with an object that also has SiteClient
    public get root(): ISiteTreeRoot {
        return this._root;
    }

    public get logStreamLabel(): string {
        return this.root.client.fullName;
    }

    public get id(): string {
        return this.root.client.id;
    }

    public get label(): string {
        return this.root.client.fullName;
    }

    public get description(): string | undefined {
        const stateDescription: string | undefined = this._state && this._state.toLowerCase() !== 'running' ? this._state : undefined;
        const previewDescription: string | undefined = this.isLinuxPreview ? localize('linuxPreview', 'Linux Preview') : undefined;
        if (stateDescription && previewDescription) {
            return `${previewDescription} - ${stateDescription}`;
        } else {
            return stateDescription || previewDescription;
        }
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(FunctionAppTreeItem.contextValue);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async refreshLabelImpl(): Promise<void> {
        try {
            this._state = await this.root.client.getState();
        } catch {
            this._state = 'Unknown';
        }
    }

    public async loadMoreChildrenImpl(): Promise<AzureTreeItem<ISiteTreeRoot>[]> {
        return [this._functionsTreeItem, this._appSettingsTreeItem, this._proxiesTreeItem];
    }

    public pickTreeItemImpl(expectedContextValue: string): AzureTreeItem<ISiteTreeRoot> | undefined {
        switch (expectedContextValue) {
            case FunctionsTreeItem.contextValue:
            case FunctionTreeItem.contextValue:
                return this._functionsTreeItem;
            case AppSettingsTreeItem.contextValue:
            case AppSettingTreeItem.contextValue:
                return this._appSettingsTreeItem;
            case ProxiesTreeItem.contextValue:
            case ProxyTreeItem.contextValue:
                return this._proxiesTreeItem;
            default:
                return undefined;
        }
    }

    public async deleteTreeItemImpl(): Promise<void> {
        await deleteSite(this.root.client);
    }
}
