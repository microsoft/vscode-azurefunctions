/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { type CodeAction } from "../../../constants";
import { type IConnectionTypesContext } from "./IConnectionTypesContext";

export interface ISetConnectionSettingContext extends IActionContext, IConnectionTypesContext, IDurableStorageProvidersSetSettingsContext {
    action: CodeAction;
    projectPath: string;
}

// -- Durable Storage Provider contexts --

type IDurableStorageProvidersSetSettingsContext = IStorageSetSettingsContext & IEventHubsSetSettingsContext & IDTSConnectionSetSettingsContext & ISqlConnectionSetSettingsContext;

export interface IStorageSetSettingsContext {
    newStorageConnectionSettingKey?: string;
    newStorageConnectionSettingValue?: string;
}

export interface IEventHubsSetSettingsContext {
    newStorageConnectionSettingKey?: string;
    newStorageConnectionSettingValue?: string;
}

export interface IDTSConnectionSetSettingsContext {
    // DTS
    newDTSConnectionSettingKey?: string;
    newDTSConnectionSettingValue?: string;

    // DTS hub
    newDTSHubConnectionSettingKey?: string;
    newDTSHubConnectionSettingValue?: string;
}

export interface ISqlConnectionSetSettingsContext {
    newSQLStorageConnectionSettingKey?: string;
    newSQLStorageConnectionSettingValue?: string;
}
