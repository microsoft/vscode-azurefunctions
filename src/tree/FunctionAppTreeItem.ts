/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { Site } from 'azure-arm-website/lib/models';
import { OutputChannel } from 'vscode';
import * as vscode from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem, ILogStream, SiteWrapper } from 'vscode-azureappservice';
import { IAzureNode, IAzureParentTreeItem, IAzureTreeItem } from 'vscode-azureextensionui';
import { ILogStreamTreeItem } from '../commands/logstream/ILogStreamTreeItem';
import { ArgumentError } from '../errors';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionsTreeItem } from './FunctionsTreeItem';
import { FunctionTreeItem } from './FunctionTreeItem';
import { ProxiesTreeItem } from './ProxiesTreeItem';
import { ProxyTreeItem } from './ProxyTreeItem';

export class FunctionAppTreeItem implements ILogStreamTreeItem, IAzureParentTreeItem {
    public static contextValue: string = 'azFuncFunctionApp';
    public readonly contextValue: string = FunctionAppTreeItem.contextValue;
    public readonly siteWrapper: SiteWrapper;
    public logStream: ILogStream | undefined;
    public logStreamPath: string = '';
    public logStreamOutputChannel: vscode.OutputChannel | undefined;

    private _state?: string;
    private _temporaryState?: string;
    private readonly _functionsTreeItem: FunctionsTreeItem;
    private readonly _appSettingsTreeItem: AppSettingsTreeItem;
    private readonly _proxiesTreeItem: ProxiesTreeItem;
    private readonly _outputChannel: OutputChannel;

    public constructor(site: Site, outputChannel: OutputChannel) {
        this.siteWrapper = new SiteWrapper(site);
        if (!site.state) {
            throw new ArgumentError(site);
        }
        this._state = site.state;
        this._outputChannel = outputChannel;
        this._functionsTreeItem = new FunctionsTreeItem(this.siteWrapper, this._outputChannel);
        this._appSettingsTreeItem = new AppSettingsTreeItem(this.siteWrapper);
        this._proxiesTreeItem = new ProxiesTreeItem(this.siteWrapper, this._outputChannel);
    }

    public get logStreamLabel(): string {
        return this.siteWrapper.appName;
    }

    private get _effectiveState(): string | undefined {
        return this._temporaryState || this._state;
    }

    public get id(): string {
        return this.siteWrapper.id;
    }

    public get label(): string {
        return !this._effectiveState || this._effectiveState === 'Running' ? this.siteWrapper.name : `${this.siteWrapper.name} (${this._effectiveState})`;
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(FunctionAppTreeItem.contextValue);
    }

    public hasMoreChildren(): boolean {
        return false;
    }

    public async refreshLabel(node: IAzureNode): Promise<void> {
        const client: WebSiteManagementClient = nodeUtils.getWebSiteClient(node);
        this._state = await this.siteWrapper.getState(client);
    }

    public async runWithTemporaryState(tempState: string, node: IAzureNode, callback: () => Promise<void>): Promise<void> {
        this._temporaryState = tempState;
        try {
            await node.refresh();
            await callback();
        } finally {
            this._temporaryState = undefined;
            await node.refresh();
        }
    }

    public async loadMoreChildren(_node: IAzureNode<IAzureTreeItem>, _clearCache: boolean | undefined): Promise<IAzureTreeItem[]> {
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
        const client: WebSiteManagementClient = nodeUtils.getWebSiteClient(node);
        await this.siteWrapper.deleteSite(client, this._outputChannel);
    }
}
