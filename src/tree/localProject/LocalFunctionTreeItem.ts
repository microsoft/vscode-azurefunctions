/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedFunctionJson } from '../../funcConfig/function';
import { FunctionTreeItemBase } from '../FunctionTreeItemBase';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';

export class LocalFunctionTreeItem extends FunctionTreeItemBase {
    public readonly parent: LocalFunctionsTreeItem;
    public readonly functionJsonPath: string;

    private constructor(parent: LocalFunctionsTreeItem, name: string, config: ParsedFunctionJson, functionJsonPath: string) {
        super(parent, config, name);
        this.functionJsonPath = functionJsonPath;
    }

    public static async create(parent: LocalFunctionsTreeItem, name: string, config: ParsedFunctionJson, functionJsonPath: string): Promise<LocalFunctionTreeItem> {
        const ti: LocalFunctionTreeItem = new LocalFunctionTreeItem(parent, name, config, functionJsonPath);
        // initialize
        await ti.refreshImpl();
        return ti;
    }

    public async getKey(): Promise<string | undefined> {
        return undefined;
    }
}
