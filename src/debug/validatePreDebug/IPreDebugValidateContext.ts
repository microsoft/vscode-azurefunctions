/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ExecuteActivityContext } from "@microsoft/vscode-azext-utils";
import { type WorkspaceFolder } from "vscode";
import { type ISetConnectionSettingContext } from "../../commands/appSettings/connectionSettings/ISetConnectionSettingContext";
import { type StorageProviderType } from "../../constants";

export interface IPreDebugValidateContext extends ISetConnectionSettingContext, ExecuteActivityContext {
    workspaceFolder: WorkspaceFolder;
    projectPath: string;

    // Project workspace settings
    projectLanguage: string | undefined;
    projectLanguageModel: number | undefined;
    validateFuncCoreTools: boolean;

    abortDebug?: boolean;
    durableStorageType?: StorageProviderType;
    funcCoreToolsVersion?: string | null;
}
