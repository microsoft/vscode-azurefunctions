/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureNode, IAzureParentNode, IAzureTreeItem } from 'vscode-azureextensionui';
import { nodeUtils } from '../utils/nodeUtils';
import { ProxiesTreeItem } from './ProxiesTreeItem';

export class ProxyTreeItem implements IAzureTreeItem {
    public static readonly contextValue: string = 'azFuncProxy';
    public readonly contextValue: string = ProxyTreeItem.contextValue;
    private readonly _name: string;

    public constructor(name: string) {
        this._name = name;
    }

    public get label(): string {
        return this._name;
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(ProxyTreeItem.contextValue);
    }

    public async deleteTreeItem(node: IAzureNode<ProxyTreeItem>): Promise<void> {
        await (<IAzureParentNode<ProxiesTreeItem>>node.parent).treeItem.deleteProxy(this._name);
    }
}
