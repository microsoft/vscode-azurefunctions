/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureNode, IAzureParentTreeItem, IAzureTreeItem } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';

export class InvalidTreeItem implements IAzureParentTreeItem {
    public readonly contextValue: string;
    public readonly label: string;
    public readonly description: string = localize('invalid', 'Invalid');

    // tslint:disable-next-line:no-any
    private _error: any;

    // tslint:disable-next-line:no-any
    constructor(label: string, error: any, contextValue: string) {
        this.label = label;
        this._error = error;
        this.contextValue = contextValue;
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(this.contextValue);
    }

    public async loadMoreChildren(_node: IAzureNode<IAzureTreeItem>, _clearCache: boolean): Promise<IAzureTreeItem[]> {
        throw this._error;
    }

    public hasMoreChildren(): boolean {
        return false;
    }
}
