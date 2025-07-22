/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";
import { type IFuncDeployContext } from "../../../deploy/deploy";
import { type IStorageSetSettingsContext } from "../ISetConnectionSettingContext";

type StorageConnectionContext = IFuncDeployContext & ISubscriptionActionContext;

export async function getStorageConnectionIfNeeded(_context: StorageConnectionContext, _appSettings: StringDictionary, _site: ParsedSite, _projectPath: string): Promise<IStorageSetSettingsContext | undefined> {
    // Skip validation on deploy - we already connect the storage account for the user when the Function App is initially created

    // Todo: In the future we can probably do more here, but first we would need to be able to correctly validate identity based scenarios, see:
    // https://github.com/microsoft/vscode-azurefunctions/issues/3688
    return undefined;
}
