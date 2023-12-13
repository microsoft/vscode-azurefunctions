/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type FunctionEnvelope } from "@azure/arm-appservice";
import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type ParsedFunctionJson } from "../funcConfig/function";
import { FunctionBase } from "../tree/FunctionBase";
import { type FuncHostRequest, type IProjectTreeItem } from "../tree/IProjectTreeItem";

export interface IFunction {
    project: IProjectTreeItem;

    data?: FunctionEnvelope;
    config: ParsedFunctionJson;
    name: string;
    isHttpTrigger: boolean;
    isTimerTrigger: boolean;
    isAnonymous: boolean;
    triggerBindingType: string | undefined;

    getKey(context: IActionContext): Promise<string | undefined>
    getTriggerRequest(context: IActionContext): Promise<FuncHostRequest | undefined>;
}

export interface ILocalFunction extends IFunction {
    functionJsonPath?: string;
}

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
