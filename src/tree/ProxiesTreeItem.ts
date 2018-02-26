/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IFileResult, SiteWrapper } from 'vscode-azureappservice';
import { IAzureNode, IAzureParentTreeItem, IAzureTreeItem, parseError, UserCancelledError } from 'vscode-azureextensionui';
import KuduClient from 'vscode-azurekudu';
import { DialogResponses } from '../DialogResponses';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { ProxyTreeItem } from './ProxyTreeItem';

export class ProxiesTreeItem implements IAzureParentTreeItem {
    public static contextValue: string = 'azFuncProxies';
    public readonly contextValue: string = ProxiesTreeItem.contextValue;
    public readonly label: string = localize('azFunc.Proxies', 'Proxies');
    public readonly childTypeLabel: string = localize('azFunc.Proxy', 'Proxy');

    private readonly _proxiesJsonPath: string = 'site/wwwroot/proxies.json';
    private _proxyConfig: IProxyConfig;
    private _etag: string;
    private _deletingProxy: boolean = false;

    private readonly _siteWrapper: SiteWrapper;
    private readonly _outputChannel: vscode.OutputChannel;

    public constructor(siteWrapper: SiteWrapper, outputChannel: vscode.OutputChannel) {
        this._siteWrapper = siteWrapper;
        this._outputChannel = outputChannel;
    }

    public get id(): string {
        return 'proxies';
    }

    public get iconPath(): nodeUtils.IThemedIconPath {
        return nodeUtils.getThemedIconPath('BulletList');
    }

    public hasMoreChildren(): boolean {
        return false;
    }

    public async loadMoreChildren(node: IAzureNode<IAzureTreeItem>, _clearCache: boolean | undefined): Promise<IAzureTreeItem[]> {
        let proxiesJson: string;
        try {
            const client: KuduClient = await nodeUtils.getKuduClient(node, this._siteWrapper);
            const result: IFileResult = await this._siteWrapper.getFile(client, this._proxiesJsonPath);
            proxiesJson = result.data;
            this._etag = result.etag;
        } catch (err) {
            // if the proxies.json file does not exist, that means there are no proxies
            return [];
        }

        try {
            const rawProxyConfig: IRawProxyConfig = <IRawProxyConfig>JSON.parse(proxiesJson);
            if (!rawProxyConfig.proxies) {
                rawProxyConfig.proxies = {};
            }
            this._proxyConfig = <IProxyConfig>rawProxyConfig;
            return Object.keys(this._proxyConfig.proxies).map((name: string) => new ProxyTreeItem(name));
        } catch (err) {
            throw new Error(localize('failedToParseProxyConfig', 'Failed to parse "proxies.json" file: {0}', parseError(err).message));
        }
    }

    public async deleteProxy(node: IAzureNode, name: string): Promise<void> {
        const message: string = localize('azFunc.ConfirmDelete', 'Are you sure you want to delete proxy "{0}"?', name);
        if (await vscode.window.showWarningMessage(message, DialogResponses.yes, DialogResponses.cancel) === DialogResponses.yes) {
            if (this._deletingProxy) {
                throw new Error(localize('multipleProxyOperations', 'An operation on the proxy config is already in progress. Wait until it has finished and try again.'));
            } else {
                this._deletingProxy = true;
                try {
                    this._outputChannel.show(true);
                    this._outputChannel.appendLine(localize('DeletingProxy', 'Deleting proxy "{0}"...', name));
                    delete this._proxyConfig.proxies[name];
                    const client: KuduClient = await nodeUtils.getKuduClient(node, this._siteWrapper);
                    const data: string = JSON.stringify(this._proxyConfig);
                    this._etag = await this._siteWrapper.putFile(client, data, this._proxiesJsonPath, this._etag);
                    this._outputChannel.appendLine(localize('DeleteProxySucceeded', 'Successfully deleted proxy "{0}".', name));
                } finally {
                    this._deletingProxy = false;
                }
            }
        } else {
            throw new UserCancelledError();
        }
    }
}

interface IRawProxyConfig {
    proxies?: { [name: string]: {} };
}

interface IProxyConfig {
    proxies: { [name: string]: {} };
}
