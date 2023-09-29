/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope } from "@azure/arm-appservice";
import { ParsedFunctionJson } from "../funcConfig/function";
import { FunctionBase } from "../tree/FunctionTreeItemBase";
import { IProjectTreeItem } from "../tree/IProjectTreeItem";
import { ILocalFunction } from "./listLocalFunctions";

export class LocalFunction extends FunctionBase implements ILocalFunction {
    constructor(
        project: IProjectTreeItem,
        name: string,
        config: ParsedFunctionJson,
        data?: FunctionEnvelope,
        public readonly functionJsonPath?: string
    ) {
        super(project, name, config, data);
    }

    public async getKey(): Promise<string | undefined> {
        return undefined;
    }
}
