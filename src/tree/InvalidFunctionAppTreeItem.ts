/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAzureNode, IAzureParentTreeItem, IAzureTreeItem } from 'vscode-azureextensionui';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';

export class InvalidFunctionAppTreeItem implements IAzureParentTreeItem {
    public static contextValue: string = 'azFuncInvalidFunctionApp';
    public readonly contextValue: string = InvalidFunctionAppTreeItem.contextValue;
    public readonly label: string;
    public readonly description: string = localize('invalid', 'Invalid');

    // tslint:disable-next-line:no-any
    private _error: any;

    // tslint:disable-next-line:no-any
    constructor(label: string, error: any) {
        this.label = label;
        this._error = error;
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(InvalidFunctionAppTreeItem.contextValue);
    }

    public async loadMoreChildren(_node: IAzureNode<IAzureTreeItem>, _clearCache: boolean): Promise<IAzureTreeItem[]> {
        throw this._error;
    }

    public hasMoreChildren(): boolean {
        return false;
    }
}
