/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { StorageAccount } from "@azure/arm-storage";
import { ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { StorageConnectionTypeValues } from "../../../../constants";
import { ISetConnectionSettingContext } from "../ISetConnectionSettingContext";

export interface IAzureWebJobsStorageWizardContext extends ISetConnectionSettingContext, Partial<ISubscriptionContext> {
    storageAccount?: StorageAccount;
    newStorageAccountName?: string;

    azureWebJobsStorageType?: StorageConnectionTypeValues;
}
