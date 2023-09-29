/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope } from '@azure/arm-appservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import { ParsedFunctionJson } from '../../funcConfig/function';
import { ILocalFunction } from '../../workspace/listLocalFunctions';
import { FunctionBase, FunctionTreeItemBase } from '../FunctionTreeItemBase';
import { IProjectTreeItem } from '../IProjectTreeItem';
import { LocalFunctionsTreeItem } from './LocalFunctionsTreeItem';

export class LocalFunction extends FunctionBase implements ILocalFunction {
    constructor(project: IProjectTreeItem, name: string, config: ParsedFunctionJson, data?: FunctionEnvelope | undefined, public readonly functionJsonPath?: string) {
        super(project, name, config, data);
    }

    public async getKey(): Promise<string | undefined> {
        return undefined;
    }
}

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
