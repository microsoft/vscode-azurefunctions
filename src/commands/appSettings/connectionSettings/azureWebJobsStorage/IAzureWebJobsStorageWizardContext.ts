/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StorageAccount } from "@azure/arm-storage";
import { type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type StorageConnectionType } from "../IConnectionTypesContext";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IAzureWebJobsStorageWizardContext extends ISetConnectionSettingContext, Partial<ISubscriptionContext> {
    storageAccount?: StorageAccount;
    newStorageAccountName?: string;

    azureWebJobsStorageType?: StorageConnectionType;
}
