/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type CodeActionValues, type ConnectionKey } from "../../../constants";
import { type IConnectionTypesContext } from "./IConnectionTypesContext";

export interface ISetConnectionSettingContext extends IActionContext, IConnectionTypesContext {
    action: CodeActionValues;
    projectPath: string;

    // Remote connections for deploy
    [ConnectionKey.Storage]?: string;
    [ConnectionKey.EventHubs]?: string;
    [ConnectionKey.SQL]?: string;
}
