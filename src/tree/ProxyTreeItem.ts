/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISiteTreeRoot } from 'vscode-azureappservice';
import { AzureTreeItem, IContextValue, TreeItemIconPath } from 'vscode-azureextensionui';
import { treeUtils } from '../utils/treeUtils';
import { ProxiesTreeItem } from './ProxiesTreeItem';

export class ProxyTreeItem extends AzureTreeItem<ISiteTreeRoot> {
    public static contextValueId: string = 'proxy';
    public readonly parent: ProxiesTreeItem;
    public readonly name: string;

    public constructor(parent: ProxiesTreeItem, name: string) {
        super(parent);
        this.name = name;
    }

    public get label(): string {
        return this.name;
    }

    public get contextValue(): IContextValue {
        return {
            id: ProxyTreeItem.contextValueId
        };
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath(ProxyTreeItem.contextValueId);
    }
}
