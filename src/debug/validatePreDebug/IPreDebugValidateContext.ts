/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type WorkspaceFolder } from "vscode";
import { type ISetConnectionSettingContext } from "../../commands/appSettings/connectionSettings/ISetConnectionSettingContext";

export interface IPreDebugValidateContext extends Omit<ISetConnectionSettingContext, 'projectPath'> {
    workspaceFolder?: WorkspaceFolder;
    projectPath?: string;

    shouldInstallFuncCoreTools?: boolean;
    isFuncCoreToolsInstalled?: boolean;
}
