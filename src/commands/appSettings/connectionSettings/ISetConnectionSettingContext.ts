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

type IDurableStorageProvidersSetSettingsContext = IStorageConnectionSetSettingsContext & IEventHubsConnectionSetSettingsContext & IDTSConnectionSetSettingsContext & ISqlDbConnectionSetSettingsContext;

export interface IStorageConnectionSetSettingsContext {
    newStorageConnectionSettingKey?: string;
    newStorageConnectionSettingValue?: string;
}

export interface IEventHubsConnectionSetSettingsContext {
    newEventHubsNamespaceConnectionSettingKey?: string;
    newEventHubsNamespaceConnectionSettingValue?: string;

    /**
     * Explicitly `undefined` when the `host.json` sets this value for us (there will be no corresponding app or local settings)
     */
    newEventHubConnectionSettingKey?: string | undefined;
    newEventHubConnectionSettingValue?: string;
}

export interface IDTSConnectionSetSettingsContext {
    newDTSConnectionSettingKey?: string;
    newDTSConnectionSettingValue?: string;

    /**
     * Explicitly `undefined` when the `host.json` sets this value for us (there will be no corresponding app or local settings)
     */
    newDTSHubConnectionSettingKey?: string;
    newDTSHubConnectionSettingValue?: string;
}

export interface ISqlDbConnectionSetSettingsContext {
    newSQLStorageConnectionSettingKey?: string;
    newSQLStorageConnectionSettingValue?: string;
}
