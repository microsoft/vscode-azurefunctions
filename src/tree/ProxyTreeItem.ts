/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISiteTreeRoot } from 'vscode-azureappservice';
import { AzureTreeItem } from 'vscode-azureextensionui';
import { nodeUtils } from '../utils/nodeUtils';
import { ProxiesTreeItem } from './ProxiesTreeItem';

export class ProxyTreeItem extends AzureTreeItem<ISiteTreeRoot> {
    public static contextValue: string = 'azFuncProxy';
    public static readOnlyContextValue: string = 'azFuncProxyReadOnly';
    public readonly parent: ProxiesTreeItem;
    private readonly _name: string;

    public constructor(parent: ProxiesTreeItem, name: string) {
        super(parent);
        this._name = name;
    }

    public get label(): string {
        return this._name;
    }

    public get contextValue(): string {
        return this.parent.readOnly ? ProxyTreeItem.readOnlyContextValue : ProxyTreeItem.contextValue;
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(ProxyTreeItem.contextValue);
    }

    public async deleteTreeItemImpl(): Promise<void> {
        await this.parent.deleteProxy(this._name);
    }
}
