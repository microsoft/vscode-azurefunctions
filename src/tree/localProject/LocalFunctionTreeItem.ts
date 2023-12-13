/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type ILocalFunction } from '../../workspace/LocalFunction';
import { FunctionTreeItemBase } from '../FunctionTreeItemBase';
import { type LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';

export class LocalFunctionTreeItem extends FunctionTreeItemBase {
    public readonly parent: LocalFunctionsTreeItem;
    public readonly functionJsonPath: string | undefined;

    private constructor(parent: LocalFunctionsTreeItem, localFunction: ILocalFunction) {
        super(parent, localFunction, /* enableProperties: */ localFunction.functionJsonPath !== undefined);
    }

    public static async create(context: IActionContext, parent: LocalFunctionsTreeItem, localFunction: ILocalFunction): Promise<LocalFunctionTreeItem> {
        const ti: LocalFunctionTreeItem = new LocalFunctionTreeItem(parent, localFunction);
        await ti.initAsync(context);
        return ti;
    }
}
