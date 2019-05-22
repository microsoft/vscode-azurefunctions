/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedFunctionJson } from '../../funcConfig/function';
import { treeUtils } from '../../utils/treeUtils';
import { FunctionTreeItem } from '../FunctionTreeItem';
import { LocalBindingsTreeItem } from './LocalBindingsTreeItem';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';
import { LocalParentTreeItem, LocalTreeItem } from './LocalTreeItem';

export class LocalFunctionTreeItem extends LocalParentTreeItem {
    public static contextValue: string = 'azFuncLocalFunction';
    public contextValue: string = LocalFunctionTreeItem.contextValue;
    private readonly _name: string;
    private _bindingsNode: LocalBindingsTreeItem;

    public constructor(parent: LocalFunctionsTreeItem, name: string, config: ParsedFunctionJson, functionJsonPath: string) {
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
        return treeUtils.getIconPath(FunctionTreeItem.contextValueBase);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<LocalTreeItem[]> {
        return [this._bindingsNode];
    }

    public pickTreeItemImpl(): LocalTreeItem {
        return this._bindingsNode;
    }
}
