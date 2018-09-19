/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingsTreeItem, AppSettingTreeItem, deleteSite, SiteClient } from 'vscode-azureappservice';
import { IAzureNode, IAzureParentTreeItem, IAzureTreeItem } from 'vscode-azureextensionui';
import { ILogStreamTreeItem } from '../commands/logstream/ILogStreamTreeItem';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionsTreeItem } from './FunctionsTreeItem';
import { FunctionTreeItem } from './FunctionTreeItem';
import { ProxiesTreeItem } from './ProxiesTreeItem';
import { ProxyTreeItem } from './ProxyTreeItem';

export class FunctionAppTreeItem implements ILogStreamTreeItem, IAzureParentTreeItem {
    public static contextValue: string = 'azFuncFunctionApp';
    public readonly contextValue: string = FunctionAppTreeItem.contextValue;
    public readonly client: SiteClient;
    public logStreamPath: string = '';

    private _state?: string;
    private readonly _functionsTreeItem: FunctionsTreeItem;
    private readonly _appSettingsTreeItem: AppSettingsTreeItem;
    private readonly _proxiesTreeItem: ProxiesTreeItem;
    private readonly _isLinuxPreview: boolean;

    public constructor(client: SiteClient, isLinuxPreview: boolean) {
        this.client = client;
        this._state = client.initialState;
        this._functionsTreeItem = new FunctionsTreeItem(client);
        this._appSettingsTreeItem = new AppSettingsTreeItem(client);
        this._proxiesTreeItem = new ProxiesTreeItem(client);
        this._isLinuxPreview = isLinuxPreview;
    }

    public get logStreamLabel(): string {
        return this.client.fullName;
    }

    public get id(): string {
        return this.client.id;
    }

    public get label(): string {
        return this.client.fullName;
    }

    public get description(): string | undefined {
        const stateDescription: string | undefined = this._state && this._state.toLowerCase() !== 'running' ? this._state : undefined;
        const previewDescription: string | undefined = this._isLinuxPreview ? localize('linuxPreview', 'Linux Preview') : undefined;
        if (stateDescription && previewDescription) {
            return `${previewDescription} - ${stateDescription}`;
        } else {
            return stateDescription || previewDescription;
        }
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(FunctionAppTreeItem.contextValue);
    }

    public hasMoreChildren(): boolean {
        return false;
    }

    public async refreshLabel(): Promise<void> {
        try {
            this._state = await this.client.getState();
        } catch {
            this._state = 'Unknown';
        }
    }

    public async loadMoreChildren(): Promise<IAzureTreeItem[]> {
        return [this._functionsTreeItem, this._appSettingsTreeItem, this._proxiesTreeItem];
    }

    public pickTreeItem(expectedContextValue: string): IAzureTreeItem | undefined {
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

    public async deleteTreeItem(_node: IAzureNode): Promise<void> {
        await deleteSite(this.client);
    }
}
