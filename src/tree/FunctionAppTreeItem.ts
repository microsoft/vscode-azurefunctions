/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OutputChannel } from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem, deleteSite, ILogStream, SiteClient } from 'vscode-azureappservice';
import { IAzureNode, IAzureParentTreeItem, IAzureTreeItem } from 'vscode-azureextensionui';
import { ILogStreamTreeItem } from '../commands/logstream/ILogStreamTreeItem';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionsTreeItem } from './FunctionsTreeItem';
import { FunctionTreeItem } from './FunctionTreeItem';
import { ProxiesTreeItem } from './ProxiesTreeItem';
import { ProxyTreeItem } from './ProxyTreeItem';

export class FunctionAppTreeItem implements ILogStreamTreeItem, IAzureParentTreeItem {
    public static contextValue: string = 'azFuncFunctionApp';
    public readonly contextValue: string = FunctionAppTreeItem.contextValue;
    public readonly client: SiteClient;
    public logStream: ILogStream | undefined;
    public logStreamPath: string = '';
    public logStreamOutputChannel: vscode.OutputChannel | undefined;

    private _state?: string;
    private readonly _functionsTreeItem: FunctionsTreeItem;
    private readonly _appSettingsTreeItem: AppSettingsTreeItem;
    private readonly _proxiesTreeItem: ProxiesTreeItem;
    private readonly _outputChannel: OutputChannel;

    public constructor(client: SiteClient, outputChannel: OutputChannel) {
        this.client = client;
        this._state = client.initialState;
        this._outputChannel = outputChannel;
        this._functionsTreeItem = new FunctionsTreeItem(client, this._outputChannel);
        this._appSettingsTreeItem = new AppSettingsTreeItem(client);
        this._proxiesTreeItem = new ProxiesTreeItem(client, this._outputChannel);
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
        return this._state && this._state.toLowerCase() !== 'running' ? this._state : undefined;
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

    public async deleteTreeItem(node: IAzureNode): Promise<void> {
        await deleteSite(this.client, node.ui, this._outputChannel);
    }
}
