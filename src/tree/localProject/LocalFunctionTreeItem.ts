/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureParentTreeItem, AzureTreeItem } from 'vscode-azureextensionui';
import { FunctionConfig } from '../../FunctionConfig';
import { nodeUtils } from '../../utils/nodeUtils';
import { FunctionTreeItem } from '../FunctionTreeItem';
import { IProjectRoot } from './IProjectRoot';
import { LocalBindingsTreeItem } from './LocalBindingsTreeItem';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';

export class LocalFunctionTreeItem extends AzureParentTreeItem<IProjectRoot> {
    public static contextValue: string = 'azFuncLocalFunction';
    public contextValue: string = LocalFunctionTreeItem.contextValue;
    private readonly _name: string;
    private _bindingsNode: LocalBindingsTreeItem;

    public constructor(parent: LocalFunctionsTreeItem, name: string, config: FunctionConfig, functionJsonPath: string) {
        super(parent);
        this._name = name;
        this._bindingsNode = new LocalBindingsTreeItem(this, config, functionJsonPath);
    }

    public get id(): string {
        return this._name;
    }

    public get label(): string {
        return this._name;
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(FunctionTreeItem.contextValue);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzureTreeItem<IProjectRoot>[]> {
        return [this._bindingsNode];
    }

    public pickTreeItemImpl(): AzureTreeItem<IProjectRoot> {
        return this._bindingsNode;
    }
}
