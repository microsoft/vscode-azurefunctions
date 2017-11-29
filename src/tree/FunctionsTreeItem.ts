/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteWrapper } from 'vscode-azureappservice';
import { IAzureNode, IAzureParentTreeItem, IAzureTreeItem } from 'vscode-azureextensionui';
import KuduClient from 'vscode-azurekudu';
import { FunctionEnvelope } from 'vscode-azurekudu/lib/models';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { FunctionTreeItem } from './FunctionTreeItem';

export class FunctionsTreeItem implements IAzureParentTreeItem {
    public static contextValue: string = 'azFuncFunctions';
    public readonly contextValue: string = FunctionsTreeItem.contextValue;
    public readonly label: string = localize('azFunc.Functions', 'Functions');
    public readonly childTypeLabel: string = localize('azFunc.Function', 'Function');

    private readonly _siteWrapper: SiteWrapper;

    public constructor(siteWrapper: SiteWrapper) {
        this._siteWrapper = siteWrapper;
    }

    public get id(): string {
        return `${this._siteWrapper.id}/functions`;
    }

    public get iconPath(): nodeUtils.IThemedIconPath {
        return nodeUtils.getThemedIconPath('BulletList');
    }

    public hasMoreChildren(): boolean {
        return false;
    }

    public async loadMoreChildren(node: IAzureNode<IAzureTreeItem>, _clearCache: boolean | undefined): Promise<IAzureTreeItem[]> {
        const client: KuduClient = await nodeUtils.getKuduClient(node, this._siteWrapper);
        const funcs: FunctionEnvelope[] = await client.functionModel.list();
        return funcs.map((fe: FunctionEnvelope) => new FunctionTreeItem(this._siteWrapper, fe, this.id));
    }
}
