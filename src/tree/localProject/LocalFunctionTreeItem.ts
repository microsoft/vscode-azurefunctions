/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem } from 'vscode-azureextensionui';
import { ParsedFunctionJson } from '../../funcConfig/function';
import { FunctionTreeItemBase } from '../FunctionTreeItemBase';
import { LocalBindingsTreeItem } from './LocalBindingsTreeItem';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';

export class LocalFunctionTreeItem extends FunctionTreeItemBase {
    public readonly parent: LocalFunctionsTreeItem;
    public readonly functionJsonPath: string;

    private readonly _bindingsNode: LocalBindingsTreeItem;

    private constructor(parent: LocalFunctionsTreeItem, name: string, config: ParsedFunctionJson, functionJsonPath: string) {
        super(parent, config, name);
        this.functionJsonPath = functionJsonPath;
        this._bindingsNode = new LocalBindingsTreeItem(this);
    }

    public static async create(parent: LocalFunctionsTreeItem, name: string, config: ParsedFunctionJson, functionJsonPath: string): Promise<LocalFunctionTreeItem> {
        const ti: LocalFunctionTreeItem = new LocalFunctionTreeItem(parent, name, config, functionJsonPath);
        // initialize
        await ti.refreshImpl();
        return ti;
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        return [this._bindingsNode];
    }

    public pickTreeItemImpl(): AzExtTreeItem {
        return this._bindingsNode;
    }

    public async getKey(): Promise<string | undefined> {
        return undefined;
    }
}
