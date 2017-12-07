/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import WebSiteManagementClient = require('azure-arm-website');
import { Site } from 'azure-arm-website/lib/models';
import { OutputChannel } from 'vscode';
import { AppSettingsTreeItem, AppSettingTreeItem, SiteWrapper } from 'vscode-azureappservice';
import { IAzureNode, IAzureParentTreeItem, IAzureTreeItem } from 'vscode-azureextensionui';
import { ArgumentError } from '../errors';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionsTreeItem } from './FunctionsTreeItem';
import { FunctionTreeItem } from './FunctionTreeItem';

export class FunctionAppTreeItem implements IAzureParentTreeItem {
    public static contextValue: string = 'azFuncFunctionApp';
    public readonly contextValue: string = FunctionAppTreeItem.contextValue;
    public readonly siteWrapper: SiteWrapper;
    public state: string | undefined;

    private readonly _functionsTreeItem: FunctionsTreeItem;
    private readonly _appSettingsTreeItem: AppSettingsTreeItem;
    private readonly _outputChannel: OutputChannel;

    public constructor(site: Site, outputChannel: OutputChannel) {
        this.siteWrapper = new SiteWrapper(site);
        if (!site.state) {
            throw new ArgumentError(site);
        }
        this.state = site.state;
        this._outputChannel = outputChannel;
        this._functionsTreeItem = new FunctionsTreeItem(this.siteWrapper, this._outputChannel);
        this._appSettingsTreeItem = new AppSettingsTreeItem(this.siteWrapper);
    }

    public get id(): string {
        return this.siteWrapper.id;
    }

    public get label(): string {
        return !this.state || this.state === 'Running' ? this.siteWrapper.name : `${this.siteWrapper.name} (${this.state})`;
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(FunctionAppTreeItem.contextValue);
    }

    public hasMoreChildren(): boolean {
        return false;
    }

    public async loadMoreChildren(_node: IAzureNode<IAzureTreeItem>, _clearCache: boolean | undefined): Promise<IAzureTreeItem[]> {
        return [this._functionsTreeItem, this._appSettingsTreeItem];
    }

    public pickTreeItem(expectedContextValue: string): IAzureParentTreeItem | undefined {
        switch (expectedContextValue) {
            case FunctionTreeItem.contextValue:
                return this._functionsTreeItem;
            case AppSettingsTreeItem.contextValue:
            case AppSettingTreeItem.contextValue:
                return this._appSettingsTreeItem;
            default:
                return undefined;
        }
    }

    public async deleteTreeItem(node: IAzureNode): Promise<void> {
        const client: WebSiteManagementClient = nodeUtils.getWebSiteClient(node);
        await this.siteWrapper.deleteSite(client, this._outputChannel);
    }
}
