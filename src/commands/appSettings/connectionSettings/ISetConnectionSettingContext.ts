/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from "@microsoft/vscode-azext-utils";
import { CodeActionValues, ConnectionKey } from "../../../constants";

export interface ISetConnectionSettingContext extends IActionContext {
    action: CodeActionValues;
    projectPath: string;

    // Remote connections for deploy
    [ConnectionKey.Storage]?: string;
    [ConnectionKey.EventHubs]?: string;
    [ConnectionKey.SQL]?: string;
}
