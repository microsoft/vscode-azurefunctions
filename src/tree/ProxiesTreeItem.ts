/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getFile, IFileResult, ISiteTreeRoot, putFile } from 'vscode-azureappservice';
import { AzureParentTreeItem, AzureTreeItem, IContextValue, IExpectedContextValue, parseError, TreeItemIconPath } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { parseJson } from '../utils/parseJson';
import { treeUtils } from '../utils/treeUtils';
import { AppPerms } from './contextValues';
import { ProxyTreeItem } from './ProxyTreeItem';
import { SlotTreeItemBase } from './SlotTreeItemBase';

export class ProxiesTreeItem extends AzureParentTreeItem<ISiteTreeRoot> {
    public static contextValueId: string = 'proxies';
    public readonly label: string = localize('Proxies', 'Proxies');
    public readonly childTypeLabel: string = localize('Proxy', 'Proxy');
    public readonly parent: SlotTreeItemBase;

    private readonly _proxiesJsonPath: string = 'site/wwwroot/proxies.json';
    private _proxyConfig: IProxyConfig;
    private _etag: string;
    private _deletingProxy: boolean = false;
    private _isReadOnly: boolean;

    private constructor(parent: SlotTreeItemBase) {
        super(parent);
    }

    public static async createProxiesTreeItem(parent: SlotTreeItemBase): Promise<ProxiesTreeItem> {
        const ti: ProxiesTreeItem = new ProxiesTreeItem(parent);
        // initialize
        await ti.refreshImpl();
        return ti;
    }

    public get id(): string {
        return 'proxies';
    }

    public get contextValue(): IContextValue {
        return {
            id: ProxiesTreeItem.contextValueId,
            perms: this.isReadOnly ? AppPerms.readOnly : AppPerms.readWrite
        };
    }

    public get description(): string {
        return this._isReadOnly ? localize('readOnly', 'Read-only') : '';
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getThemedIconPath('list-unordered');
    }

    public get isReadOnly(): boolean {
        return this._isReadOnly;
    }

    public async refreshImpl(): Promise<void> {
        this._isReadOnly = await this.parent.isReadOnly();
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(): Promise<AzureTreeItem<ISiteTreeRoot>[]> {
        let proxiesJson: string;
        try {
            const result: IFileResult = await getFile(this.root.client, this._proxiesJsonPath);
            proxiesJson = result.data;
            this._etag = result.etag;
        } catch (err) {
            // if the proxies.json file does not exist, that means there are no proxies
            return [];
        }

        try {
            const rawProxyConfig: IRawProxyConfig = parseJson(proxiesJson);
            if (!rawProxyConfig.proxies) {
                rawProxyConfig.proxies = {};
            }
            this._proxyConfig = <IProxyConfig>rawProxyConfig;
            return Object.keys(this._proxyConfig.proxies).map((name: string) => new ProxyTreeItem(this, name));
        } catch (err) {
            throw new Error(localize('failedToParseProxyConfig', 'Failed to parse "proxies.json" file: {0}', parseError(err).message));
        }
    }

    public async deleteProxy(name: string): Promise<void> {
        if (this._deletingProxy) {
            throw new Error(localize('multipleProxyOperations', 'An operation on the proxy config is already in progress. Wait until it has finished and try again.'));
        } else {
            this._deletingProxy = true;
            try {
                delete this._proxyConfig.proxies[name];
                const data: string = JSON.stringify(this._proxyConfig);
                this._etag = await putFile(this.root.client, data, this._proxiesJsonPath, this._etag);
            } finally {
                this._deletingProxy = false;
            }
        }
    }

    public isAncestorOfImpl(expectedContextValue: IExpectedContextValue): boolean {
        return expectedContextValue.id === ProxyTreeItem.contextValueId;
    }
}

interface IRawProxyConfig {
    proxies?: { [name: string]: {} };
}

interface IProxyConfig {
    proxies: { [name: string]: {} };
}
